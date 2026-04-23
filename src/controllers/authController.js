const bcrypt = require("bcrypt");
const { generateTokens, verifyRefreshToken } = require("../utils/jwt");
const User = require("../models/User");
const EmailOtp = require("../models/EmailOtp");
const cloudinary = require("cloudinary").v2;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { sendSmsVerification, checkSmsVerification } = require("../utils/twilioVerify");
const { loginOrRegisterWithGoogle, isProfileComplete } = require("../services/googleAuthService");
const { loginOrRegisterWithFacebook } = require("../services/facebookAuthService");

const SALT_ROUNDS = 10;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

let sharpAvailable = false;
let sharp = null;
try {
  sharp = require("sharp");
  sharpAvailable = true;
} catch (e) {
  // sharp not installed — we'll gracefully fallback and instruct client
  sharpAvailable = false;
}

class AuthController {
  /**
   * Helper: Process images to Cloudinary only
   */
  static async processImage(dataUri) {
    if (!dataUri) return { url: null };

    // Cloudinary is required
    if (!process.env.CLOUDINARY_URL) {
      throw new Error("Cloudinary is not configured. Cannot process images.");
    }

    const match = dataUri.match(/^data:(image\/jpeg|image\/png);base64,(.+)$/);
    if (!match)
      throw new Error("Invalid image format. Use PNG or JPG base64 data URI.");

    const b64 = match[2];
    const sizeInBytes =
      (b64.length * 3) / 4 -
      (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

    let buffer = Buffer.from(b64, "base64");

    // If the image is bigger than allowed, try server-side compression using sharp
    if (sizeInBytes > MAX_BYTES) {
      if (!sharpAvailable) {
        throw new Error(
          "ID image too large (max 5MB). Server can compress images if 'sharp' is installed, or compress on the client.",
        );
      }

      try {
        // Attempt progressive compression: start at 80% quality and downscale until under limit
        let quality = 80;
        let resizedBuffer = buffer;
        // decode metadata to determine width for resizing if necessary
        const meta = await sharp(buffer).metadata();
        let width = meta.width || 1000;

        while (resizedBuffer.length > MAX_BYTES && quality >= 20) {
          const targetWidth = Math.max(
            400,
            Math.floor((width * quality) / 100),
          );
          resizedBuffer = await sharp(buffer)
            .resize({ width: targetWidth })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
          quality -= 15;
        }

        if (resizedBuffer.length > MAX_BYTES) {
          throw new Error(
            "ID image too large after server compression (max 5MB)",
          );
        }

        buffer = resizedBuffer;
      } catch (e) {
        console.error("Server-side image compression failed", e);
        throw new Error("ID image too large (max 5MB)");
      }
    }

    // Upload to Cloudinary (required)
    try {
      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: "user_ids",
      });
      return {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      };
    } catch (e) {
      console.error("Cloudinary upload failed", e);
      throw new Error("Failed to upload image to Cloudinary");
    }
  }

  /**
   * Register user
   * POST /api/v1/auth/register
   */
  static async register(req, res, next) {
    try {
      const {
        email,
        password,
        first_name,
        last_name,
        phone,
        role,
        id_image_front,
        id_image_back,
      } = req.validatedBody;

      console.log("DEBUG: register received", {
        email: email && email.toLowerCase(),
        phone,
      });

      const timing = {
        start: Date.now(),
        last: Date.now(),
      };

      function logStep(name) {
        const now = Date.now();
        console.log(
          `TIMING: ${name} ${now - timing.last}ms (since last); ${now - timing.start}ms (total)`,
        );
        timing.last = now;
      }

      const phoneNumber = phone;
      if (!phoneNumber)
        return res
          .status(400)
          .json({ success: false, message: "Phone number required" });

      // 2. Verify Email OTP
      const emailNormalized = (email || "").toLowerCase().trim();
      const emailOtpDoc = await EmailOtp.findOne({ email: emailNormalized });
      const isEmailVerified =
        !!emailOtpDoc?.verified &&
        !!emailOtpDoc?.verifiedExpiresAt &&
        new Date() <= emailOtpDoc.verifiedExpiresAt;

      if (!isEmailVerified) {
        return res.status(400).json({
          success: false,
          message: "Email not verified. Please verify your email OTP first.",
        });
      }

      // 3. Duplicate Checks
      const existing = await User.findOne({
        $or: [{ email: emailNormalized }, { phone: phoneNumber }],
        deleted_at: null,
      });
      if (existing)
        return res
          .status(409)
          .json({ success: false, message: "User already exists" });

      // 4. Process Images (Cloudinary only)
      let front, back;
      try {
        const imgStart = Date.now();
        front = await AuthController.processImage(id_image_front);
        logStep("image_front_process");
        back = await AuthController.processImage(id_image_back);
        logStep("image_back_process");
        console.log("TIMING: images_total", Date.now() - imgStart, "ms");
      } catch (imgErr) {
        return res
          .status(400)
          .json({ success: false, message: imgErr.message });
      }

      // 5. Create Stripe Connect Account
      let stripeAccountId = null;
      try {
        const account = await stripe.accounts.create({
          type: "express",
          email: emailNormalized,
          capabilities: {
            transfers: { requested: true },
          },
        });
        stripeAccountId = account.id;
        logStep("stripe_account_create");
      } catch (stripeErr) {
        console.error("Stripe account creation failed:", stripeErr.message);
        // We continue even if Stripe fails, but log it
      }

      // 6. Create User
      const hashStart = Date.now();
      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
      logStep("password_hash");
      const userCreateStart = Date.now();
      // Also set profile_complete on normal registration
      const profileComplete = !!(phoneNumber && front.url && back.url);
      const user = await User.create({
        email: emailNormalized,
        password_hash,
        first_name,
        last_name,
        phone: phoneNumber,
        role,
        auth_provider: "email",
        profile_complete: profileComplete,
        phone_verified: false,
        email_verified: true,
        // Store Cloudinary URLs and public IDs
        id_image_front_url: front.url,
        id_image_front_public_id: front.public_id,
        id_image_back_url: back.url,
        id_image_back_public_id: back.public_id,
        // Store Stripe Account ID
        stripeAccountId,
        // Ensure avatar fields exist so client/profile endpoints don't fail
        avatar_url: null,
        avatar_public_id: null,
      });

      logStep("user_create");
      console.log("DEBUG: user created", {
        userId: user._id.toString(),
        email: user.email,
      });

      // Cleanup
      await EmailOtp.deleteOne({ email: emailNormalized });
      logStep("email_otp_cleanup");

      console.log(`TIMING: register_total ${Date.now() - timing.start}ms`);
      const tokens = generateTokens(user._id.toString());

      const safeUser = user.toJSON();
      delete safeUser.id_image_front;
      delete safeUser.id_image_back; // Don't send buffers back

      res
        .status(201)
        .json({ success: true, data: { user: safeUser, ...tokens } });
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.validatedBody;
      const emailNormalized = (email || "").toLowerCase().trim();
      const user = await User.findOne({
        email: emailNormalized,
        deleted_at: null,
      });

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }

      const tokens = generateTokens(user._id.toString());
      const safeUser = user.toJSON();
      delete safeUser.id_image_front;
      delete safeUser.id_image_back;

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: { user: safeUser, ...tokens },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Google Login
   * POST /api/v1/auth/google
   */
  static async googleLogin(req, res, next) {
    try {
      const { id_token } = req.body;
      if (!id_token) {
        return res.status(400).json({ success: false, message: "Google id_token is required" });
      }

      const result = await loginOrRegisterWithGoogle(id_token);
      res.status(200).json({
        success: true,
        message: result.profile_complete ? "Login successful" : "Login successful - profile incomplete",
        data: result,
      });
    } catch (err) {
      console.error("Google login error:", err.message);
      if (err.message.includes("Invalid") || err.message.includes("unverified")) {
        return res.status(401).json({ success: false, message: err.message });
      }
      next(err);
    }
  }

  /**
   * Facebook Login
   * POST /api/v1/auth/facebook
   */
  static async facebookLogin(req, res, next) {
    try {
      const { access_token } = req.body;
      if (!access_token) {
        return res.status(400).json({ success: false, message: "Facebook access_token is required" });
      }

      const result = await loginOrRegisterWithFacebook(access_token);
      res.status(200).json({
        success: true,
        message: result.profile_complete ? "Login successful" : "Login successful - profile incomplete",
        data: result,
      });
    } catch (err) {
      console.error("Facebook login error:", err.message);
      if (err.message.includes("Invalid")) {
        return res.status(401).json({ success: false, message: err.message });
      }
      next(err);
    }
  }

  /**
   * Complete Profile (for social login users who need to add phone + ID)
   * POST /api/v1/auth/complete-profile
   * Requires auth middleware
   */
  static async completeProfile(req, res, next) {
    try {
      const { phone, id_image_front, id_image_back } = req.body;
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      let phoneNumber = phone;

      // Update phone
      if (phoneNumber) {
        // Check for duplicate phone
        const phoneExists = await User.findOne({ phone: phoneNumber, _id: { $ne: userId }, deleted_at: null });
        if (phoneExists) {
          return res.status(409).json({ success: false, message: "Phone number already in use" });
        }
        user.phone = phoneNumber;
        user.phone_verified = false;
      }

      // Process ID images
      if (id_image_front) {
        try {
          const frontResult = await AuthController.processImage(id_image_front);
          user.id_image_front_url = frontResult.url;
          user.id_image_front_public_id = frontResult.public_id;
        } catch (imgErr) {
          return res.status(400).json({ success: false, message: "Front ID: " + imgErr.message });
        }
      }

      if (id_image_back) {
        try {
          const backResult = await AuthController.processImage(id_image_back);
          user.id_image_back_url = backResult.url;
          user.id_image_back_public_id = backResult.public_id;
        } catch (imgErr) {
          return res.status(400).json({ success: false, message: "Back ID: " + imgErr.message });
        }
      }

      // Check if profile is now complete
      user.profile_complete = isProfileComplete(user);
      await user.save();

      const safeUser = user.toJSON();
      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: { user: safeUser, profile_complete: user.profile_complete },
      });
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req, res, next) {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token)
        return res
          .status(400)
          .json({ success: false, message: "Refresh token required" });

      const decoded = verifyRefreshToken(refresh_token);
      const user = await User.findOne({
        _id: decoded.userId,
        deleted_at: null,
      });
      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "User not found" });

      const tokens = generateTokens(user._id.toString());
      res
        .status(200)
        .json({ success: true, data: { user: user.toJSON(), ...tokens } });
    } catch (error) {
      res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }
  }

  static async logout(req, res) {
    res.status(200).json({ success: true, message: "Logout successful" });
  }

  static async getMe(req, res) {
    res.status(200).json({ success: true, data: req.user });
  }

  static async deleteAccount(req, res, next) {
    try {
      await User.findByIdAndUpdate(req.user.id, { deleted_at: new Date() });
      res.status(200).json({ success: true, message: "Account deleted" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send phone OTP via Twilio Verify
   * POST /api/auth/send-otp
   */
  static async sendOtp(req, res) {
    try {
      const { phoneNumber } = req.validatedBody;

      const verification = await sendSmsVerification(phoneNumber);

      return res.status(200).json({
        success: true,
        message: "OTP sent successfully",
        data: {
          phoneNumber,
          status: verification.status,
        },
      });
    } catch (error) {
      if (
        error?.message?.includes("Twilio credentials are missing") ||
        error?.status === 401
      ) {
        return res.status(500).json({
          success: false,
          message: "OTP service is not configured",
        });
      }

      if (error?.status === 400) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number",
          data: {
            errorCode: error.code || null,
            details: error.message,
          },
        });
      }

      if (error?.status === 429) {
        return res.status(429).json({
          success: false,
          message: "Too many OTP requests. Please try again later.",
        });
      }

      console.error("sendOtp error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP",
      });
    }
  }

  /**
   * Verify phone OTP via Twilio Verify
   * POST /api/auth/verify-otp
   */
  static async verifyOtp(req, res) {
    try {
      const { phoneNumber, code } = req.validatedBody;

      const verificationCheck = await checkSmsVerification(phoneNumber, code);

      if (verificationCheck.status === "approved") {
        return res.status(200).json({
          success: true,
          message: "OTP verified successfully",
          data: {
            phoneNumber,
            status: verificationCheck.status,
          },
        });
      }

      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP code",
        data: {
          status: verificationCheck.status,
        },
      });
    } catch (error) {
      if (
        error?.message?.includes("Twilio credentials are missing") ||
        error?.status === 401
      ) {
        return res.status(500).json({
          success: false,
          message: "OTP service is not configured",
        });
      }

      if (error?.status === 404 || error?.status === 400) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired OTP code",
          data: {
            errorCode: error.code || null,
            details: error.message,
          },
        });
      }

      if (error?.status === 429) {
        return res.status(429).json({
          success: false,
          message: "Too many verification attempts. Please try again later.",
        });
      }

      console.error("verifyOtp error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to verify OTP",
      });
    }
  }
}

module.exports = AuthController;
