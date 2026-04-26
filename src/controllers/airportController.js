const Airport = require("../models/Airport");

class AirportController {
  /**
   * Get all airports (with search and geo-location)
   * GET /api/v1/airports
   */
  static async getAll(req, res, next) {
  try {
    const { country, q, latitude, longitude, radius = 200000 } = req.query;

    // 1. Handle Pagination Parameters
    const page = parseInt(req.query.page, 10) || 1;
    const requestedLimit = parseInt(req.query.limit, 10);
    
    // Maintain your existing "Smart Limits" for Map vs List
    const isGeoSearch = Number.isFinite(parseFloat(latitude)) && Number.isFinite(parseFloat(longitude));
    const defaultLimit = isGeoSearch ? 80 : q ? 100 : 2000;
    const maxLimit = isGeoSearch ? 150 : 2000;
    const limit = Math.min(requestedLimit || defaultLimit, maxLimit);
    
    // Calculate how many documents to skip
    const skip = (page - 1) * limit;

    const filter = { is_active: true };

    // ... (Your existing filter logic for q, isGeoSearch, and country remains same)

    // 2. Apply Pagination to the Query
    let query = Airport.find(filter)
      .skip(skip) // Jump to the correct page
      .limit(limit)
      .lean();

    // ... (Your existing sorting and selection logic remains same)

    const airports = await query;
    
    // 3. Optional: Get total count for the frontend to calculate "hasMore"
    const total = await Airport.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: airports,
      count: airports.length,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_results: total
      }
    });
  } catch (error) {
    next(error);
  }
}

  /**
   * Get airport by ID
   * GET /api/v1/airports/:id
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;
      const airport = await Airport.findById(id);

      if (!airport) {
        return res.status(404).json({
          success: false,
          message: "Airport not found",
        });
      }

      res.status(200).json({
        success: true,
        data: airport,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AirportController;
