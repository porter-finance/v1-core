import { BigNumber, utils } from "ethers";
import { BondConfigType } from "./interfaces";

export const TEN_MINUTES_FROM_NOW_IN_SECONDS = Math.round(
  new Date(new Date().setMinutes(new Date().getMinutes() + 10)).getTime() / 1000
);
export const ONE_DAY_FROM_NOW_IN_SECONDS = Math.round(
  new Date(new Date().setHours(new Date().getHours() + 24)).getTime() / 1000
);
export const ONE_MONTH_FROM_NOW_IN_SECONDS = Math.round(
  new Date(new Date().setMonth(new Date().getMonth() + 1)).getTime() / 1000
);
export const ONE_YEAR_FROM_NOW_IN_SECONDS = Math.round(
  new Date(new Date().setFullYear(new Date().getFullYear() + 1)).getTime() /
    1000
);
export const TWO_YEARS_FROM_NOW_IN_SECONDS = Math.round(
  new Date(new Date().setFullYear(new Date().getFullYear() + 2)).getTime() /
    1000
);
export const THREE_YEARS_FROM_NOW_IN_SECONDS = Math.round(
  new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
    1000
);
export const ELEVEN_YEARS_FROM_NOW_IN_SECONDS = Math.round(
  new Date(new Date().setFullYear(new Date().getFullYear() + 11)).getTime() /
    1000
);

export const ONE = utils.parseUnits("1", 18);
export const WAD = utils.parseUnits("1", 18);

export const ZERO = BigNumber.from(0);
export const FIFTY_MILLION = 50000000;
export const HALF_FIFTY_MILLION = (FIFTY_MILLION / 2).toString();
const QUARTER_FIFTY_MILLION = (FIFTY_MILLION / 4).toString();
// The config objects are used as anchors to test against
export const NonConvertibleBondConfig: BondConfigType = {
  collateralTokenAmount: utils.parseUnits(HALF_FIFTY_MILLION, 18),
  convertibleTokenAmount: ZERO,
  maturity: THREE_YEARS_FROM_NOW_IN_SECONDS,
  maxSupply: utils.parseUnits(FIFTY_MILLION.toString(), 18),
};

export const ConvertibleBondConfig: BondConfigType = {
  collateralTokenAmount: utils.parseUnits(HALF_FIFTY_MILLION, 18),
  convertibleTokenAmount: utils.parseUnits(QUARTER_FIFTY_MILLION, 18),
  maturity: THREE_YEARS_FROM_NOW_IN_SECONDS,
  maxSupply: utils.parseUnits(FIFTY_MILLION.toString(), 18),
};

export const UncollateralizedBondConfig: BondConfigType = {
  collateralTokenAmount: ZERO,
  convertibleTokenAmount: ZERO,
  maturity: THREE_YEARS_FROM_NOW_IN_SECONDS,
  maxSupply: utils.parseUnits(FIFTY_MILLION.toString(), 18),
};

export const MaliciousBondConfig: BondConfigType = {
  collateralTokenAmount: utils.parseUnits(HALF_FIFTY_MILLION, 18),
  convertibleTokenAmount: utils.parseUnits(QUARTER_FIFTY_MILLION, 18),
  maturity: THREE_YEARS_FROM_NOW_IN_SECONDS,
  maxSupply: utils.parseUnits(FIFTY_MILLION.toString(), 18),
};

export const deploymentBonds = [
  {
    // This bond has a short maturity and a full FIFTY_MILLION
    // Since we pay HALF_FIFTY_MILLION, this bond will "Default"
    config: {
      ...NonConvertibleBondConfig,
      maturity: TEN_MINUTES_FROM_NOW_IN_SECONDS,
      maxSupply: utils.parseUnits(FIFTY_MILLION.toString(), 6),
    },
    auctionOptions: {},
  },
  {
    // This will be an "Active" convertible bond
    config: {
      ...ConvertibleBondConfig,
      maturity: ONE_DAY_FROM_NOW_IN_SECONDS,
      maxSupply: utils.parseUnits(FIFTY_MILLION.toString(), 6),
    },
    auctionOptions: {},
  },
  {
    // This will be an "Active" Un-Collateralized bond
    config: {
      ...UncollateralizedBondConfig,
      maturity: ONE_MONTH_FROM_NOW_IN_SECONDS,
      maxSupply: utils.parseUnits(FIFTY_MILLION.toString(), 6),
    },
    auctionOptions: {
      // Whose auction will not be cancellable
      orderCancellationEndDate: TEN_MINUTES_FROM_NOW_IN_SECONDS,
    },
  },
  {
    // This will be an "Active" Non-Convertible bond
    config: {
      ...NonConvertibleBondConfig,
      maturity: ONE_YEAR_FROM_NOW_IN_SECONDS,
      maxSupply: utils.parseUnits(FIFTY_MILLION.toString(), 6),
    },
    auctionOptions: {
      // Whose auction will be ended
      auctionEndDate: TEN_MINUTES_FROM_NOW_IN_SECONDS,
      orderCancellationEndDate: TEN_MINUTES_FROM_NOW_IN_SECONDS,
    },
  },
  {
    // This will be a "Paid" convertible bond
    config: {
      ...ConvertibleBondConfig,
      // Make bond mature
      maturity: TEN_MINUTES_FROM_NOW_IN_SECONDS,
      // Make bond paid off (we are paying HALF_FIFTY_MILLION in deploy)
      maxSupply: utils.parseUnits(HALF_FIFTY_MILLION.toString(), 6),
    },
    auctionOptions: {},
  },
  {
    // This will be a "PaidEarly" Non-Convertible bond
    config: {
      ...NonConvertibleBondConfig,
      maturity: THREE_YEARS_FROM_NOW_IN_SECONDS,
      // Make bond paid off (we are paying HALF_FIFTY_MILLION in deploy)
      maxSupply: utils.parseUnits(HALF_FIFTY_MILLION.toString(), 6),
    },
    auctionOptions: {},
  },
];

export const easyAuction = require("../contracts/external/EasyAuction");
export const rinkebyGnosis = "0xC5992c0e0A3267C7F75493D0F717201E26BE35f7";
