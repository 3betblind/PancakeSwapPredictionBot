  
# 🔮 PancakeSwap Prediction AI Bot 2024 Updated

![PancakeSwap-Logo](/img/logo.jpg?raw=true)

PancakeSwap Prediction Bot using live TradingView AI recomendations. **~80% Win rate**.
 
## 🐰⚡ Installation

Download and Install Node here:
https://nodejs.org/en/download/ 

Then run the following commands in terminal:

1. ``git clone https://github.com/3betblind/pancakepredictionbot2024.git`` 
2. ``cd PancakeswapPredictionBot-2024`` (replace with your cloned/downloaded bot folder)
3. ``npm i``

![enter image description here](/img/setup.jpg?raw=true)




## ⚙️ Setup

1. Open the **.env** file with any code/text editor and add your private key like so:
```
PRIVATE_KEY=0xa2hjtjnhjputdavmarh3uqmntxevx6j6faui8cuxcppyqmuekj54btyd
```
3. Open the **bot.js** file and setup the following variables:
```
  MIN_BET_AMOUNT: 5, //Min Bet Amount in USD
  MAX_BET_AMOUNT: 3, //Max Bet Amount in USD
  DAILY_GOAL: 2000, // Daily Goal in USD,
  WAITING_TIME: 261000, // in Miliseconds (4.3 Minutes)
  THRESHOLD: 70, // Minimum % of certainty of signals (50 - 100)
  METHOD: "BOTH", // Available Methods COPY / PREDICTION / BOTH
  REMOVEADDRESSPERCENTAGE: 50, // Remove addresses with win rate below 50%
```
4. Start the bot using `npm start` or `yarn start`
5. 🔮 Enjoy!

### 🔓 How to convert seed phrase to Private Key
A lot of wallets don't provide you the private key, but just the **seed phrase** ( 12 words ). So here you will learn how to convert that to a private key:
1. Enter [Here](https://youtu.be/eAXdLEZFbiw) and follow the instructions. Website used is [this one](https://iancoleman.io/bip39/).

![Winning rate](/img/rate.jpg?raw=true)


## 🤖📈 Strategy
- The bot take a series of recomendations given by Trading View and proccess them together with the tendency of the rest of people betting. After the algorithm have complete, it choose to bet **🟢UP** or **🔴DOWN**.
- After all my testings in aprox 300 rounds I was able to achieve a **~70% Win rate**. Of course it depends of a lot of variables, so I can't ensure that you will reproduce the same behavior. But I can tell that I make $20 - $70 daily with $3 Bets.
- Before every round the bot will check if you have enough balance in your wallet and if you have reached the daily goal.
- Also it will save the daily history in the **/history** directory.
- Be aware that after consecutive losses, statistically you have more chances to win in the next one.
- Inside **bot.js** in the ``THRESHOLD`` property of ``GLOBAL_CONFIG`` variable, you can configure the minimum certainty with which the bot will bet. For default it's set to 50, which means that from 50% certainty the bot will bet. You can raise it (50-100) to bet only when the bot is more sure about its prediction.
- Its recomendable to have x10 - x50 the amount of bet to have an average of rounds.
- There is also a possibility to copy trades in the new Version. Just change the method to "copy" or Both.


💰 You can check the history of rounds and claim rewards here: https://pancakeswap.finance/prediction

 
## 🤖 Commands
- Here are some Commands you may use during the bot is running.
stats - Show stats
treshold <number> - Set treshold for prediction strategy
method <copy|prediction|both> - Change Method
address add <address> - Add address to copy
address remove <address> - Remove address from copy
address list - List addresses to copy


## 👁️ Disclaimers

🔧**The code is in BETA, so please be aware of the risks that come with it.**
Don't risk money you're not willing to lose.

💸**This code, repository or scripts should NOT be construed as investment advice.**
Any mention of past or projected investment performance is not, and should not be construed as, a recommendation or guarantee of any particular result or benefit. By using this application, you agree to bear all risk of loss of money and waive any claims against the developers of the program or anyone associated with it.

We accept no liability for any loss resulting from inaccuracy or incompleteness, nor for any loss incurred or dissemination of information through the Internet, such as disruptions or interruptions. When using web forms, we strive to minimize the number of fields used. Bot shall not be liable for any loss arising out of the use of any data, advice or ideas recommended or derived from bot.

**Please be aware of clones**

