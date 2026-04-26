const mongoose = require('mongoose');
const path = require('path');
// This tells dotenv to look one level up for the .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function diagnose() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error("❌ Error: MONGODB_URI is undefined. Check your .env file path.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("✅ Connected to MongoDB Atlas...");
    
    // ... rest of the diagnostic code
    // Access the collection directly by name to avoid "Module Not Found"
    const collection = mongoose.connection.collection('airports'); 

    console.log("\n--- 1. CURRENT INDEXES ---");
    const indexes = await collection.indexes();
    console.table(indexes.map(idx => ({ Name: idx.name, Keys: JSON.stringify(idx.key) })));

    // Explain Plan for slowness check
    console.log("\n--- 2. PERFORMANCE EXPLAIN PLAN ---");
    const explanation = await collection.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [-6.8416, 33.9716] },
          $maxDistance: 200000
        }
      }
    }).explain("executionStats");

    const stats = explanation.executionStats;
    console.log(`- Strategy: ${stats.executionStages.stage || 'N/A'}`);
    console.log(`- Total Docs Examined: ${stats.totalDocsExamined}`);
    
    if (stats.executionStages.stage === "COLLSCAN") {
        console.error("❌ SLOW: Collection Scan (COLLSCAN). You are missing a 2dsphere index.");
    } else {
        console.log("✅ FAST: Index Scan (IXSCAN) detected.");
    }

    process.exit(0);
  } catch (err) {
    console.error("Diagnosis failed:", err);
    process.exit(1);
  }
}

diagnose();