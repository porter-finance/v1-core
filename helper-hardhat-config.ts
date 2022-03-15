import { HardhatNetworkForkingUserConfig } from 'hardhat/types';

import { eEthereumNetwork, iEthereumParamsPerNetwork } from './test/interfaces'
require('dotenv').config();

const ALCHEMY_KEY = process.env.ALCHEMY_KEY || '';
const FORK = process.env.FORK as eEthereumNetwork || ''
const FORK_BLOCK_NUMBER = process.env.FORK_BLOCK_NUMBER
    ? parseInt(process.env.FORK_BLOCK_NUMBER)
    : 0;


export const buildForkConfig = (): HardhatNetworkForkingUserConfig | undefined => {
    let forkMode;
    if (FORK) {
        forkMode = {
            url: NETWORKS_RPC_URL[FORK],
        } as HardhatNetworkForkingUserConfig;
        if (FORK_BLOCK_NUMBER || BLOCK_TO_FORK[FORK]) {
            forkMode.blockNumber = FORK_BLOCK_NUMBER || BLOCK_TO_FORK[FORK];
        }
    }
    return forkMode;
};

export const NETWORKS_RPC_URL: iEthereumParamsPerNetwork<string> = {
    [eEthereumNetwork.rinkeby]: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_KEY}`,
    [eEthereumNetwork.main]: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
    [eEthereumNetwork.hardhat]: 'http://localhost:8545',

};

export const BLOCK_TO_FORK: iEthereumParamsPerNetwork<number | undefined> = {
    [eEthereumNetwork.main]: 12406069,
    [eEthereumNetwork.rinkeby]: 10333393,
    [eEthereumNetwork.hardhat]: undefined,
};
