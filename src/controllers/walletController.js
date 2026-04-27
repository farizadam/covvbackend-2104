const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const Payout = require("../models/Payout");
const User = require("../models/User");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Minimum withdrawal amount in cents (5.00 EUR)
const MINIMUM_WITHDRAWAL = 500;

/**
 * GET /api/v1/wallet
 * Get current user's wallet balance and summary
 */
exports.getWallet = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get or create wallet
    const wallet = await Wallet.getOrCreateWallet(userId);

    // Get recent transactions (last 5)
    const recentTransactions = await Transaction.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Get pending payouts count
    const pendingPayouts = await Payout.countDocuments({
      user_id: userId,
      status: { $in: ["pending", "processing"] },
    });

    res.status(200).json({
      success: true,
      data: {
        wallet: {
          balance: wallet.balance,
          balance_display: (wallet.balance / 100).toFixed(2),
          pending_balance: wallet.pending_balance,
          pending_balance_display: (wallet.pending_balance / 100).toFixed(2),
          total_earned: wallet.total_earned,
          total_earned_display: (wallet.total_earned / 100).toFixed(2),
          total_withdrawn: wallet.total_withdrawn,
          total_withdrawn_display: (wallet.total_withdrawn / 100).toFixed(2),
          currency: wallet.currency,
          can_withdraw: wallet.balance >= MINIMUM_WITHDRAWAL,
          minimum_withdrawal: MINIMUM_WITHDRAWAL,
          minimum_withdrawal_display: (MINIMUM_WITHDRAWAL / 100).toFixed(2),
        },
        recent_transactions: recentTransactions,
        pending_payouts: pendingPayouts,
      },
    });
  } catch (error) {
    console.error("Get wallet error:", error);
    next(error);
  }
};

/**
 * GET /api/v1/wallet/transactions
 * Get user's transaction history with pagination
 */
exports.getTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type; // Optional filter by type
    const skip = (page - 1) * limit;

    // Build query
    const query = { user_id: userId };
    if (type) {
      query.type = type;
    }

    // Get transactions
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    next(error);
  }
};

/**
 * GET /api/v1/wallet/payouts
 * Get user's payout/withdrawal history
 */
exports.getPayouts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      Payout.find({ user_id: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payout.countDocuments({ user_id: userId }),
    ]);

    res.status(200).json({
      success: true,
      data: payouts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error("Get payouts error:", error);
    next(error);
  }
};

/**
 * POST /api/v1/wallet/withdraw
 * Request a withdrawal to bank account
 * Body: { amount } - amount in cents, or { amount_eur } - amount in EUR
 * 
 * MONEY SAFETY: This uses a persisted payout state machine.
 * Flow:
 *   1. Validate input + check balance/bank/pending
 *   2. START TRANSACTION
 *      a. Atomically deduct wallet balance
 *      b. Create payout record as pending
 *      c. Create transaction record
 *   3. COMMIT TRANSACTION
 *   4. Create Stripe transfer, then mark payout processing with stripe_transfer_id
 *   5. Create Stripe payout, then mark payout completed with stripe_payout_id
 *   6. On any Stripe error, mark payout failed with the failure reason
 */
exports.requestWithdrawal = async (req, res, next) => {
  let session = null;
  let payout = null;
  let transaction = null;
  let walletAfterWithdraw = null;

  try {
    const userId = req.user.id;
    let { amount, amount_eur } = req.body;

    if (amount_eur && !amount) {
      amount = Math.round(parseFloat(amount_eur) * 100);
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid withdrawal amount is required',
      });
    }

    if (amount < MINIMUM_WITHDRAWAL) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal is ${(MINIMUM_WITHDRAWAL / 100).toFixed(2)} EUR`,
      });
    }

    const user = await User.findById(userId);
    const wallet = await Wallet.getOrCreateWallet(userId);

    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance',
        available: wallet.balance,
        available_display: (wallet.balance / 100).toFixed(2),
      });
    }

    if (!user.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Please connect your bank account first',
        code: 'NO_STRIPE_ACCOUNT',
      });
    }

    const pendingPayout = await Payout.findOne({
      user_id: userId,
      status: { $in: ['pending', 'processing'] },
    });

    if (pendingPayout) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending withdrawal. Please wait for it to complete.',
        pending_payout: {
          amount: pendingPayout.amount,
          amount_display: (pendingPayout.amount / 100).toFixed(2),
          status: pendingPayout.status,
          requested_at: pendingPayout.requested_at,
        },
      });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    try {
      walletAfterWithdraw = await Wallet.atomicWithdraw(wallet._id, amount, session);

      const [payoutDoc] = await Payout.create(
        [
          {
            user_id: userId,
            wallet_id: wallet._id,
            amount,
            currency: (process.env.STRIPE_CURRENCY || 'eur').toUpperCase(),
            status: 'pending',
            payout_method: 'standard',
            estimated_arrival: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            requested_at: new Date(),
          },
        ],
        { session }
      );
      payout = payoutDoc;

      const [txDoc] = await Transaction.create(
        [
          {
            wallet_id: wallet._id,
            user_id: userId,
            type: 'withdrawal',
            amount: -amount,
            gross_amount: amount,
            fee_amount: 0,
            net_amount: amount,
            currency: (process.env.STRIPE_CURRENCY || 'eur').toUpperCase(),
            status: 'pending',
            reference_type: 'payout',
            reference_id: payout._id,
            description: 'Withdrawal to bank account',
            processed_at: null,
          },
        ],
        { session }
      );
      transaction = txDoc;

      payout.transaction_id = transaction._id;
      await payout.save({ session });

      await session.commitTransaction();
      session.endSession();
      session = null;

      console.log(
        `[WITHDRAW] Phase 1 complete: wallet deducted, payout ${payout._id} created as pending for user ${userId}`
      );
    } catch (dbError) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
        session = null;
      }

      console.error('[WITHDRAW] Phase 1 failed (DB transaction aborted):', dbError.message);

      if (dbError.message === 'Insufficient balance or wallet not found') {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance',
        });
      }

      throw dbError;
    }

    try {
      const transfer = await stripe.transfers.create({
        amount,
        currency: process.env.STRIPE_CURRENCY || 'eur',
        destination: user.stripeAccountId,
        metadata: {
          payout_id: payout._id.toString(),
          user_id: userId,
        },
      });

      payout.status = 'processing';
      payout.stripe_transfer_id = transfer.id;
      payout.processing_started_at = new Date();
      payout.failure_reason = null;
      payout.failure_code = null;
      await payout.save();

      transaction.stripe_transfer_id = transfer.id;
      await transaction.save();

      console.log(
        `[WITHDRAW] Stripe transfer ${transfer.id} created for payout ${payout._id}; payout marked processing`
      );

      const stripePayout = await stripe.payouts.create(
        {
          amount,
          currency: process.env.STRIPE_CURRENCY || 'eur',
          metadata: {
            payout_id: payout._id.toString(),
            user_id: userId,
            stripe_transfer_id: transfer.id,
          },
        },
        { stripeAccount: user.stripeAccountId }
      );

      payout.status = 'completed';
      payout.stripe_payout_id = stripePayout.id;
      payout.completed_at = new Date();
      payout.metadata = {
        ...(payout.metadata || {}),
        stripe_transfer_id: transfer.id,
        stripe_payout_id: stripePayout.id,
      };
      await payout.save();

      transaction.status = 'completed';
      transaction.stripe_payout_id = stripePayout.id;
      transaction.processed_at = new Date();
      transaction.metadata = {
        ...(transaction.metadata || {}),
        stripe_transfer_id: transfer.id,
        stripe_payout_id: stripePayout.id,
      };
      await transaction.save();

      console.log(
        `[WITHDRAW] Stripe payout ${stripePayout.id} created for payout ${payout._id}; payout marked completed`
      );

      return res.status(200).json({
        success: true,
        message: 'Withdrawal completed successfully',
        data: {
          payout: {
            id: payout._id,
            amount: payout.amount,
            amount_display: (payout.amount / 100).toFixed(2),
            status: payout.status,
            estimated_arrival: payout.estimated_arrival,
            stripe_transfer_id: payout.stripe_transfer_id,
            stripe_payout_id: payout.stripe_payout_id,
          },
          new_balance: walletAfterWithdraw.balance,
          new_balance_display: (walletAfterWithdraw.balance / 100).toFixed(2),
        },
      });
    } catch (stripeError) {
      console.error(
        `[WITHDRAW] Stripe payout flow failed for payout ${payout?._id}:`,
        stripeError.message
      );

      const failedAtStep = payout?.stripe_transfer_id ? 'payout' : 'transfer';

      if (failedAtStep === 'transfer' && payout) {
        try {
          await Wallet.atomicRefund(payout.wallet_id, payout.amount);
          console.log(
            `[WITHDRAW] Refunded ${payout.amount} cents to wallet ${payout.wallet_id} after Stripe transfer failure for payout ${payout._id}`
          );
        } catch (refundError) {
          console.error(
            '[WITHDRAW] Critical: Failed to refund wallet after Stripe transfer error:',
            refundError.message
          );
        }
      }

      if (payout) {
        payout.status = 'failed';
        payout.failure_reason = stripeError.message;
        payout.failure_code = stripeError.code || stripeError.type || null;
        payout.metadata = {
          ...(payout.metadata || {}),
          stripe_transfer_id: payout.stripe_transfer_id,
          stripe_payout_id: payout.stripe_payout_id,
          failed_at_step: failedAtStep,
        };
        await payout.save().catch((saveError) => {
          console.error(
            `[WITHDRAW] Failed to persist failed payout ${payout._id}:`,
            saveError.message
          );
        });
      }

      if (transaction) {
        transaction.status = 'failed';
        transaction.stripe_transfer_id =
          payout?.stripe_transfer_id || transaction.stripe_transfer_id;
        transaction.stripe_payout_id =
          payout?.stripe_payout_id || transaction.stripe_payout_id;
        transaction.metadata = {
          ...(transaction.metadata || {}),
          error: stripeError.message,
          error_code: stripeError.code || stripeError.type || null,
          failed_at_step: failedAtStep,
        };
        await transaction.save().catch((saveError) => {
          console.error(
            `[WITHDRAW] Failed to persist failed transaction ${transaction._id}:`,
            saveError.message
          );
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to process withdrawal',
        error: stripeError.message,
      });
    }
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (sessionError) {
        console.error('[WITHDRAW] Session cleanup error:', sessionError.message);
      }
    }

    console.error('Request withdrawal error:', error);
    next(error);
  }
};
/**
 * GET /api/v1/wallet/earnings-summary
 * Get earnings summary (total earned, by period, etc.)
 */
exports.getEarningsSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const wallet = await Wallet.getOrCreateWallet(userId);

    // Get earnings this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonthEarnings = await Transaction.aggregate([
      {
        $match: {
          user_id: wallet.user_id,
          type: "ride_earning",
          status: "completed",
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$net_amount" },
          count: { $sum: 1 },
          total_fees: { $sum: "$fee_amount" },
        },
      },
    ]);

    // Get earnings last month
    const startOfLastMonth = new Date(startOfMonth);
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

    const lastMonthEarnings = await Transaction.aggregate([
      {
        $match: {
          user_id: wallet.user_id,
          type: "ride_earning",
          status: "completed",
          createdAt: { $gte: startOfLastMonth, $lt: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$net_amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Count total completed rides
    const totalRides = await Transaction.countDocuments({
      user_id: userId,
      type: "ride_earning",
      status: "completed",
    });

    const thisMonth = thisMonthEarnings[0] || { total: 0, count: 0, total_fees: 0 };
    const lastMonth = lastMonthEarnings[0] || { total: 0, count: 0 };

    res.status(200).json({
      success: true,
      data: {
        total_earned: wallet.total_earned,
        total_earned_display: (wallet.total_earned / 100).toFixed(2),
        total_withdrawn: wallet.total_withdrawn,
        total_withdrawn_display: (wallet.total_withdrawn / 100).toFixed(2),
        available_balance: wallet.balance,
        available_balance_display: (wallet.balance / 100).toFixed(2),
        pending_balance: wallet.pending_balance,
        pending_balance_display: (wallet.pending_balance / 100).toFixed(2),
        this_month: {
          earnings: thisMonth.total,
          earnings_display: (thisMonth.total / 100).toFixed(2),
          rides: thisMonth.count,
          fees_paid: thisMonth.total_fees,
          fees_paid_display: (thisMonth.total_fees / 100).toFixed(2),
        },
        last_month: {
          earnings: lastMonth.total,
          earnings_display: (lastMonth.total / 100).toFixed(2),
          rides: lastMonth.count,
        },
        total_rides: totalRides,
        platform_fee_percentage: parseFloat(process.env.PLATFORM_FEE_PERCENT || "10"),
        driver_percentage: 100 - parseFloat(process.env.PLATFORM_FEE_PERCENT || "10"),
      },
    });
  } catch (error) {
    console.error("Get earnings summary error:", error);
    next(error);
  }
};

/**
 * GET /api/v1/wallet/calculate-earnings
 * Calculate potential earnings for a ride (preview before creating)
 * Query: { price_per_seat, seats }
 */
exports.calculateEarnings = async (req, res, next) => {
  try {
    const { price_per_seat, seats } = req.query;

    const pricePerSeat = parseFloat(price_per_seat) || 0;
    const seatCount = parseInt(seats) || 1;

    const grossAmount = Math.round(pricePerSeat * seatCount * 100); // Convert to cents
    const feePercentage = parseFloat(process.env.PLATFORM_FEE_PERCENT || "10");
    const feeAmount = Math.round(grossAmount * (feePercentage / 100));
    const netAmount = grossAmount - feeAmount;

    res.status(200).json({
      success: true,
      data: {
        gross_amount: grossAmount,
        gross_amount_display: (grossAmount / 100).toFixed(2),
        platform_fee_percentage: feePercentage,
        platform_fee: feeAmount,
        platform_fee_display: (feeAmount / 100).toFixed(2),
        your_earnings: netAmount,
        your_earnings_display: (netAmount / 100).toFixed(2),
        your_percentage: 100 - feePercentage,
        currency: "EUR",
        breakdown: {
          price_per_seat: pricePerSeat,
          seats: seatCount,
          total_price: pricePerSeat * seatCount,
        },
      },
    });
  } catch (error) {
    console.error("Calculate earnings error:", error);
    next(error);
  }
};

/**
 * POST /api/v1/wallet/connect-bank
 * Start the process to connect a bank account via Stripe
 */
exports.connectBankAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    let accountId = user.stripeAccountId;

    // Create Stripe Connect account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "FR", // Change based on user's country
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          user_id: userId,
        },
      });

      accountId = account.id;
      user.stripeAccountId = accountId;
      await user.save();
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/wallet/connect-refresh`,
      return_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/wallet/connect-success`,
      type: "account_onboarding",
    });

    res.status(200).json({
      success: true,
      data: {
        url: accountLink.url,
        expires_at: accountLink.expires_at,
      },
    });
  } catch (error) {
    console.error("Connect bank account error:", error);
    next(error);
  }
};

/**
 * GET /api/v1/wallet/bank-status
 * Check if bank account is connected and verified
 */
exports.getBankStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user.stripeAccountId) {
      return res.status(200).json({
        success: true,
        data: {
          connected: false,
          verified: false,
          message: "No bank account connected",
        },
      });
    }

    // Get account status from Stripe
    const account = await stripe.accounts.retrieve(user.stripeAccountId);

    const isVerified =
      account.charges_enabled ||
      (account.capabilities?.transfers === "active");

    res.status(200).json({
      success: true,
      data: {
        connected: true,
        verified: isVerified,
        details_submitted: account.details_submitted,
        payouts_enabled: account.payouts_enabled,
        requirements: account.requirements?.currently_due || [],
        message: isVerified
          ? "Bank account connected and verified"
          : "Bank account connected but verification pending",
      },
    });
  } catch (error) {
    console.error("Get bank status error:", error);
    next(error);
  }
};


