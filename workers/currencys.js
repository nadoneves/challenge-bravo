require('dotenv').config();

const axios = require('axios');
const redis = require("redis");
const { CurrencysModel, CurrencysRaw } = require('../models/currencys');

const AWAIT_DELAY_SECONDS = process.env.AWAIT_DELAY_SECONDS || 300;

const sleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

const getBallastDefault = async () => {
    try {
        const { data } = await axios.get(`https://api.coingate.com/v2/rates`);
        const {BTC, ETH, USD} = data.merchant;

        return {
            BTC: 1 / BTC.USD,
            ETH: 1 / ETH.USD,
            USD: 1,
            BRL: USD.BRL * 1,
            EUR: USD.EUR * 1
        }
    } catch (error) {
        throw new Error(error);
    }
}

const setCurrencyRedis = async (key, value) => {
    try {
        const redisClient = redis.createClient({
            url: process.env.REDIS_HOST_TLS,
            password: process.env.REDIS_PASSWORD_TLS
        });

        await redisClient.connect();
        
        await redisClient.set(key, value);

        await redisClient.disconnect();
    } catch (error) {
        throw new Error(error);
    }
};

const selectedCurrencys = [
    { currency:'USD', crypto: false },
    { currency:'BRL', crypto: false },
    { currency:'EUR', crypto: false },
    { currency:'BTC', crypto: true },
    { currency:'ETH', crypto: true }
];

const handler = async () => {
    while (true) {

        const transaction = await CurrencysRaw.transaction();

        try {
            console.log('>> GET CURRENCYS ON PUBLIC API AND POPULATE DATABASE/REDIS');

            const ballastDefault = await getBallastDefault();
            const currencys = Object.keys(ballastDefault);
            const countDataInDB = await CurrencysModel.findAll();
            if(countDataInDB.length === 0) {
                console.log('>>> POPULATE DATABASE');
                for (let i = 0; i < currencys.length; i++) {
                    const currency = currencys[i];
                    
                    const defaultCurrency = selectedCurrencys.find(f => f.currency == currency.toUpperCase());
                    if(!defaultCurrency) continue;

                    await CurrencysModel.create({ 
                        currency: defaultCurrency.currency, 
                        ballast_usd: ballastDefault[currency],
                        crypto: defaultCurrency.crypto,
                        imported: true, 
                        createdAt: new Date(), 
                        updatedAt: new Date() 
                    }, { transaction });
                }
                console.log('>>> POPULATE DATABASE COMPLETED');
            } else {
                console.log('>>> UPDATE');
                for (let i = 0; i < currencys.length; i++) {
                    const currency = currencys[i];
                    
                    const defaultCurrency = selectedCurrencys.find(f => f.currency == currency.toUpperCase());
                    if(!defaultCurrency) continue;
                    
                    await CurrencysModel.update(
                        { 
                            ballast_usd: ballastDefault[currency], 
                            crypto: defaultCurrency.crypto,
                            imported: true, 
                            updatedAt: new Date() 
                        }, 
                        { 
                            where: { currency: currency.toUpperCase() },
                            transaction
                        }
                    );
                }
                console.log('>>> UPDATE COMPLETED');
            }

            await transaction.commit();

            console.log('>>> UPDATE REDIS DATABASE');
            const currencysInDB = await CurrencysModel.findAll();
            for (let i = 0; i < currencysInDB.length; i++) {
                const currency = currencysInDB[i];
                await setCurrencyRedis(currency.currency, 
                    JSON.stringify(
                        { 
                            currency: currency.currency,
                            ballast_usd: parseFloat(currency.ballast_usd),
                            crypto: currency.crypto
                        }
                    )
                );
            }
            console.log('>>> UPDATE REDIS DATABASE COMPLETED');
        } catch (error) {
            console.error('>> ERRO AO CONSULTAR DADOS', error);
            await transaction.rollback();
        }

        console.log('>> AWAITING ' + AWAIT_DELAY_SECONDS + ' SECONDS TO NEXT RUN');
        await sleep(AWAIT_DELAY_SECONDS * 1000);
    }
};

handler();