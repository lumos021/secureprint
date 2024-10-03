const PrintJob = require('../models/printJobModel');

exports.getDailyStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await PrintJob.aggregate([
      {
        $match: {
          userId: req.user.userId,
          createdAt: { $gte: today },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalPages: { $sum: "$pageCount" },
          colorPages: {
            $sum: {
              $cond: [{ $eq: ["$colorMode", "color"] }, "$pageCount", 0]
            }
          },
          bwPages: {
            $sum: {
              $cond: [{ $eq: ["$colorMode", "b&w"] }, "$pageCount", 0]
            }
          }
        }
      }
    ]);

    res.json(stats[0] || { totalPages: 0, colorPages: 0, bwPages: 0 });
  } catch (error) {
    res.status(500).json({ message: "Error fetching statistics" });
  }
};