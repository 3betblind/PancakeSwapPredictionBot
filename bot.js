const { parseEther } = require("@ethersproject/units");
const sleep = require("util").promisify(setTimeout);
const {
  getStats,
  predictionContract,
  getBNBPrice,
  checkBalance,
  saveRound,
  getClaimableEpochs,
  getWalletAddress,
  getRoundData,
} = require("./lib");
const {
  TradingViewScan,
  SCREENERS_ENUM,
  EXCHANGES_ENUM,
  INTERVALS_ENUM,
} = require("trading-view-recommends-parser-nodejs");
const fs = require("fs");
const readline = require('readline');
const addressFilePath = 'addresses.json';

// Global Config
const GLOBAL_CONFIG = {
  MIN_BET_AMOUNT: 5, // in USD
  MAX_BET_AMOUNT: 3, // in USD
  DAILY_GOAL: 2000, // in USD,
  WAITING_TIME: 261000, // in Miliseconds (4.3 Minutes)
  THRESHOLD: 70, // Minimum % of certainty of signals (50 - 100)
  METHOD: "PREDICTION", // Available Methods COPY / PREDICTION / BOTH
  REMOVEADDRESSPERCENTAGE: 50, // Remove addresses with win rate below 50%
};

// Load existing addresses
let addressesToCopy = [];
if (fs.existsSync(addressFilePath)) {
  addressesToCopy = JSON.parse(fs.readFileSync(addressFilePath));
} else {
  fs.writeFileSync(addressFilePath, JSON.stringify(addressesToCopy));
}

// Variables
const INTERVAL_IN_MINUTES = 5;
const WAITING_TIME_IN_MINUTES = GLOBAL_CONFIG.WAITING_TIME / 60000;
const PREDICTION_INTERVAL_IN_MINUTES = INTERVAL_IN_MINUTES + (INTERVAL_IN_MINUTES - WAITING_TIME_IN_MINUTES);
const INTERVAL_KEY = PREDICTION_INTERVAL_IN_MINUTES + "m";
const addressStatsPath = "addressStats.json";
const collectedData = [];
let addressStats;
if (fs.existsSync(addressStatsPath)) {
  addressStats = JSON.parse(fs.readFileSync(addressStatsPath));
} else {
  addressStats = {};
}
const betEpochs = new Set();




const percentage = (a, b) => {
  const total = a + b;
  return total === 0 ? 0 : parseInt((100 * a) / total);
};


// Function to calculate bet amount based on accuracy
const calculateBetAmount = (accuracy, BNBPrice, minAccuracy = 50) => {
  if (accuracy <= minAccuracy) {
    return GLOBAL_CONFIG.MIN_BET_AMOUNT / BNBPrice;
  }

  const range = GLOBAL_CONFIG.MAX_BET_AMOUNT - GLOBAL_CONFIG.MIN_BET_AMOUNT;
  const scaledAccuracy = (accuracy - minAccuracy) / (100 - minAccuracy);
  const betAmount = GLOBAL_CONFIG.MIN_BET_AMOUNT + scaledAccuracy * range;

  return betAmount / BNBPrice;
};


// claimMoney function
const claimMoney = async (epoch, walletAddress) => {
  try {
    let claimableEpochs = await getClaimableEpochs(
      predictionContract,
      epoch,
      walletAddress
    );

    const optionsGas = {
      gasPrice: 5000000000, // 5 Gwei
      gasLimit: 100000, // 93000
    };

    const tx = await predictionContract.claim(claimableEpochs, optionsGas);
    await tx.wait();

    console.log(`💰 Successful Claim for Epoch #${epoch}.`);
  } catch (error) {
    console.error(`💰 Claim Error for Epoch #${epoch}:`);
    console.error(`   Wallet Address: ${walletAddress}`);
    console.error(`   Error Message: ${error.message}`);
  }
};


// betUp function
const betUp = async (amount, epoch) => {
  try {
    const value = parseEther(amount.toFixed(18));
    const tx = await predictionContract.betBull(epoch, { value });
    await tx.wait();
    console.log(`🤞 Bet UP Placed: Amount ${amount} BNB, Epoch #${epoch}`);
    betEpochs.add(epoch.toString());
  } catch (error) {
    console.error(`🚫 Bet UP Error for Epoch #${epoch}:`, error);
  }
};


// betDown function
const betDown = async (amount, epoch) => {
  try {
    const value = parseEther(amount.toFixed(18));
    const tx = await predictionContract.betBear(epoch, { value });
    await tx.wait();
    console.log(`🤞 Bet DOWN Placed: Amount ${amount} BNB, Epoch #${epoch}`);
    betEpochs.add(epoch.toString());
  } catch (error) {
    console.error(`🚫 Bet DOWN Error for Epoch #${epoch}:`, error);
  }
};


// analyzeSignal function
const analyzeSignal = async (intervalKey) => {
  try {
    const result = await new TradingViewScan(
      SCREENERS_ENUM.crypto,
      EXCHANGES_ENUM.BINANCE,
      "BNBUSDT",
      INTERVALS_ENUM[intervalKey]
    ).analyze();
    return result.summary;
  } catch (error) {
    console.error("Error in analyzeSignal:", error);
    return null;
  }
};

const getSignals = async () => {
  try {
    // 1 Minute signals
    const minRecomendation = await analyzeSignal(INTERVAL_KEY);

    // 5 Minute signals
    const medRecomendation = await analyzeSignal(INTERVAL_KEY);

    if (minRecomendation && medRecomendation) {
      const averageBuy =
        (parseInt(minRecomendation.BUY) + parseInt(medRecomendation.BUY)) / 2;
      const averageSell =
        (parseInt(minRecomendation.SELL) + parseInt(medRecomendation.SELL)) / 2;
      const averageNeutral =
        (parseInt(minRecomendation.NEUTRAL) +
          parseInt(medRecomendation.NEUTRAL)) /
        2;

      return {
        buy: averageBuy,
        sell: averageSell,
        neutral: averageNeutral,
      };
    } else {
      console.error("Error: Missing recommendations in getSignals.");
      return false;
    }
  } catch (error) {
    console.error(`Error in getSignals: ${error.message}`);
    return false;
  }
};


const processBet = async (sender, epoch, betType, upDirection) => {
  if (!addressStats[sender]) {
    addressStats[sender] = { bets: [], wins: 0, trades: 0 };
  }
  addressStats[sender].bets.push({ epoch: epoch.toString(), bet: betType });

  if (!betEpochs.has(epoch.toString()) && addressesToCopy.includes(sender)) {
    const direction = upDirection ? "UP 🟢" : "DOWN 🔴";
    console.log(`${epoch.toString()} 🔮 Prediction: ${direction} Copied from ${sender}`);
    const betAmount = await getCopyAmount(epoch, upDirection);
    if (!betEpochs.has(epoch.toString())) {
      betEpochs.add(epoch.toString());
      if (upDirection) {
        await betUp(betAmount, epoch);
      } else {
        await betDown(betAmount, epoch);
      }
    } else {
      console.log("[DOUBLE BET] NOT BETTING");
    }
    await saveRound(epoch.toString(), [{
      round: epoch.toString(),
      betAmount: betAmount.toString(),
      bet: betType,
    }]);
  }

};
const copy = async () => {
  let BNBPrice;
  let earnings = await getStats();
  if (earnings.profit_USD >= GLOBAL_CONFIG.DAILY_GOAL) {
    console.log("🧞 Daily goal reached. Shutting down... ✨");
    process.exit();
  }
  try {
    BNBPrice = await getBNBPrice();
  } catch (err) {
    console.error("Error fetching BNB price:", err);
    return;
  }

  predictionContract.on("BetBear", (sender, epoch, amount) => {
    processBet(sender, epoch, "bear", false);
  });

  predictionContract.on("BetBull", (sender, epoch, amount) => {
    processBet(sender, epoch, "bull", true);
  });
};

const getCopyAmount = async (epoch, up) => {
  try {
    const BNBPrice = await getBNBPrice();
    const signals = await getSignals();
    const isBuyGreater = signals.buy > signals.sell;
    const accuracy = isBuyGreater
      ? percentage(signals.buy, signals.sell)
      : percentage(signals.sell, signals.buy);
    const betAmount = calculateBetAmount(accuracy, BNBPrice, GLOBAL_CONFIG.THRESHOLD);

    if ((up && isBuyGreater) || (!up && !isBuyGreater)) {
      return betAmount;
    } else {
      return GLOBAL_CONFIG.MIN_BET_AMOUNT / BNBPrice; // Anti-loss strategy
    }
  } catch (err) {
    console.error("Error getting the copy amount.", err);
    return GLOBAL_CONFIG.MIN_BET_AMOUNT / await getBNBPrice(); // Default to min bet amount on error
  }
};
const strategy = async (minAccuracy, epoch) => {
  let BNBPrice;
  let earnings = await getStats();
  if (earnings.profit_USD >= GLOBAL_CONFIG.DAILY_GOAL) {
    console.log("🧞 Daily goal reached. Shutting down... ✨");
    process.exit();
  }
  try {
    BNBPrice = await getBNBPrice();
  } catch (err) {
    console.error("Error fetching BNB price:", err);
    return;
  }
  const signals = await getSignals();
  if (!signals) return; // If no signals, skip the round

  const accuracy = (signals.buy > signals.sell)
    ? percentage(signals.buy, signals.sell)
    : percentage(signals.sell, signals.buy);

  if (accuracy >= minAccuracy) {
    const betAmount = calculateBetAmount(accuracy, BNBPrice, minAccuracy);
    const direction = signals.buy > signals.sell ? "UP 🟢" : "DOWN 🔴";
    console.log(`${epoch.toString()} 🔮 Prediction: ${direction} ${accuracy}%`);
    console.log(`Bet Amount: ${betAmount} BNB`);

    if (signals.buy > signals.sell) {
      await betUp(betAmount, epoch);
    } else {
      await betDown(betAmount, epoch);
    }
    betEpochs.add(epoch.toString());
    await saveRound(epoch.toString(), [{
      round: epoch.toString(),
      betAmount: betAmount.toString(),
      bet: direction === "UP 🟢" ? "bull" : "bear",
    }]);
  } else {
    console.log(`Waiting for a stronger signal. Current accuracy: ${accuracy}%`);
  }
};


function analyzeAndRecommend(currentEpoch) {
  const MIN_TRADES = 20;
  let topAddresses = [];
  let topRecentAddresses = [];

  for (const [address, stats] of Object.entries(addressStats)) {
    if (stats.trades && stats.trades >= 5) {
      const overallWinRate = stats.wins / stats.trades;

      if (stats.trades >= MIN_TRADES) {
        topAddresses.push({
          address,
          winRate: overallWinRate,
          trades: stats.trades,
        });
      }

      const recentTrades = stats.bets
        .filter(
          (bet) => bet.epoch >= currentEpoch - 4 && bet.epoch <= currentEpoch
        )
        .sort((a, b) => b.epoch - a.epoch);

      if (recentTrades.length === 5) {
        const recentWins = recentTrades.filter((bet) => bet.bet === "bull").length;
        const recentWinRate = recentWins / 5;
        topRecentAddresses.push({ address, winRate: recentWinRate, trades: stats.trades });
      }
    }
  }

  topAddresses = topAddresses.sort((a, b) => b.winRate - a.winRate || b.trades - a.trades).slice(0, 5);
  topRecentAddresses = topRecentAddresses.sort((a, b) => b.winRate - a.winRate || b.trades - a.trades).slice(0, 5);



  console.log("\nTop 5 Adresses of All Time:");
  for (const { address, winRate, trades } of topAddresses) {
    console.log(
      `Adress: ${address}, Winrate: ${(winRate * 100).toFixed(2)}%, Trades: ${trades}`
    );
  }

  console.log("\nTop 5 Adresses of Last 5 Trades:");
  for (const { address, winRate, trades } of topRecentAddresses) {
    console.log(
      `Adress: ${address}, Current Winrate: ${(winRate * 100).toFixed(2)}%, Trades: ${trades}`
    );
  }
  console.log("--------------------------------");
}
  function startRoundLog(epoch) {
    console.log(`🥞 Starting round ${epoch}`);
    console.log(`🕑 Waiting ${(GLOBAL_CONFIG.WAITING_TIME / 60000).toFixed(1)} minutes for the next bet opportunity.`);
  }

  function endRoundLog(stats) {
    console.log("--------------------------------");
    console.log(`🍀 Round ended. Current statistics:`);
    console.log(`👍 Wins: ${stats.win} | 👎 Losses: ${stats.loss}`);
    console.log(`💰 Profit: ${stats.profit_USD.toFixed(3)} USD`);
    console.log("--------------------------------");
  }

  
  function startStrategy(GLOBAL_CONFIG, hasEnoughBalance, betEpochs, epoch) {
    if (!hasEnoughBalance) {
      console.log("⚠️ Not enough balance to place a bet.");
      return;
    }
  
    if (GLOBAL_CONFIG.METHOD === "PREDICTION" || GLOBAL_CONFIG.METHOD === "BOTH") {
      // If no copy trade is found, use the prediction strategy
      if (!betEpochs.has(epoch.toString())) {
        console.log("🔄 No copy trade found, using prediction strategy.");
        strategy(GLOBAL_CONFIG.THRESHOLD, epoch);
      }
    }
  
    if (GLOBAL_CONFIG.METHOD === "COPY") {
      // Copy strategy is handled by the 'copy' function
      console.log("🔁 Waiting for copy trades...");
    }
  }
  

// Console Interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', async (input) => {
  const [command,command2,command3] = input.split(' ');

  switch (command) {
    case 'address':
      switch (command2) {
        case 'add':
          addAddress(command3);
          break;
        case 'remove':
          removeAddress(command3);
        case 'list':
          listAddresses();
          break;
      }
      break;
    case 'stats':
      stats = await getStats();
      console.log(`👍 Wins: ${stats.win} | 👎 Losses: ${stats.loss}`);
      console.log(`💰 Profit: ${stats.profit_USD.toFixed(3)} USD`);
      break;
    case 'treshold':
      if (command2 < 50 || command2 > 100) {
        console.log('Treshold must be between 50 and 100.');
        break;
      }
      GLOBAL_CONFIG.THRESHOLD = command2;
      console.log(`Treshold set to ${GLOBAL_CONFIG.THRESHOLD}%`);
      break;
    case 'method':
      if(command2 !== 'copy' && command2 !== 'prediction' && command2 !== 'both') {
        console.log('Method must be either copy, prediction or both.');
        break;
      }
      GLOBAL_CONFIG.METHOD = command2.toUpperCase();
    default:
      console.log('Unknown command.');
      console.log('stats - Show stats');
      console.log('treshold <number> - Set treshold for prediction strategy');
      console.log('method <copy|prediction|both> - Set method');
      console.log('address add <address> - Add address to copy');
      console.log('address remove <address> - Remove address from copy');
      console.log('address list - List addresses to copy');
    }
});

function addAddress(address) {
  if (!addressesToCopy.includes(address)) {
    addressesToCopy.push(address);
    saveAddresses();
    console.log(`Address ${address} added.`);
  } else {
    console.log(`Address ${address} is already in the list.`);
  }
}

function removeAddress(address) {
  const index = addressesToCopy.indexOf(address);
  if (index > -1) {
    addressesToCopy.splice(index, 1);
    saveAddresses();
    console.log(`Address ${address} removed.`);
  } else {
    console.log(`Address ${address} not found.`);
  }
}

function listAddresses() {
  if (addressesToCopy.length) {
    console.log('Addresses to copy:');
    addressesToCopy.forEach(address => {
      if (addressStats[address]) {
        console.log(`${address} - Win Rate: ${(addressStats[address].wins / addressStats[address].trades * 100).toFixed(2)}%`);
      } else {
        console.log(address);
      }
    });
  } else {
    console.log('No addresses to copy.');
  }
}

function saveAddresses() {
  fs.writeFileSync(addressFilePath, JSON.stringify(addressesToCopy));
}

// Automated removal of addresses with win rate below percentage
function autoRemoveLowPerformingAddresses() {
  addressesToCopy.forEach((address) => {
    if (addressStats[address]) {
      const winRate = addressStats[address].wins / addressStats[address].trades;
      if (winRate < GLOBAL_CONFIG.REMOVEADDRESSPERCENTAGE / 100) {
        removeAddress(address);
        console.log(`Address ${address} automatically removed due to win rate below ${GLOBAL_CONFIG.REMOVEADDRESSPERCENTAGE}%`);
      }
    }
  });
}

// Welcome message and initialization
console.log(`🤗 Welcome! Strategy: ${GLOBAL_CONFIG.METHOD.toUpperCase()}`);
if (GLOBAL_CONFIG.METHOD === "COPY" || GLOBAL_CONFIG.METHOD === "BOTH") copy();


// Betting
predictionContract.on("StartRound", async (epoch) => {
  startRoundLog(epoch);
  await sleep(GLOBAL_CONFIG.WAITING_TIME);
  const hasEnoughBalance = await checkBalance(GLOBAL_CONFIG.MAX_BET_AMOUNT);
  startStrategy(GLOBAL_CONFIG, hasEnoughBalance, betEpochs, epoch);
});

// Show stats
predictionContract.on("EndRound", async (epoch) => {
  await saveRound(epoch);
  let stats = await getStats();
  let claimableEpochs = await predictionContract.claimable(epoch, getWalletAddress());

  if (claimableEpochs) {
    claimMoney(epoch, getWalletAddress());
  }

  endRoundLog(stats);

  const roundData = await getRoundData(epoch);
  
  for (const address in addressStats) {
    const stats = addressStats[address];
    stats.trades++;
    const betForEpoch = stats.bets.find((bet) => bet.epoch === epoch.toString());
    if (betForEpoch && betForEpoch.bet === roundData[0].winner) {
      stats.wins++;
    }
  }

  if (GLOBAL_CONFIG.METHOD == "BOTH" || GLOBAL_CONFIG.METHOD == "COPY") {
    analyzeAndRecommend(epoch, roundData);
    autoRemoveLowPerformingAddresses() 
    fs.writeFileSync(addressStatsPath, JSON.stringify(addressStats));
  }
});

console.log('Enter commands:');

