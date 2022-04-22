import {
  Contract,
  utils,
  constants,
  ContractFactory,
  ContractTransaction,
  Event,
} from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TestERC20, BondFactory, Bond } from "../../typechain";
import { ConvertibleBondConfig } from "../../test/constants";
import { BondParams } from "../../test/BondFactory.spec";

export const deployNativeAndPayment = async (
  owner: SignerWithAddress,
  MockErc20Contract: ContractFactory
) => {
  const native = (await MockErc20Contract.connect(owner).deploy(
    "Native Token",
    "NATIVE",
    utils.parseUnits("50000000", 20),
    18
  )) as TestERC20;

  const pay = (await MockErc20Contract.connect(owner).deploy(
    "Payment Token",
    "PAY",
    utils.parseUnits("500"),
    18
  )) as TestERC20;

  return await Promise.all([native.deployed(), pay.deployed()]);
};

/*
  This function is copied from the one in utils because
  we need to pass in the getContractAt due to hardhat limitations
  importing their injected ethers variables during tasks execution
*/
export const createBond = async (
  owner: SignerWithAddress,
  getContractAt: Function,
  collateralToken: TestERC20,
  paymentToken: TestERC20,
  factory: BondFactory,
  params: BondParams
) => {
  // these could be converted to parameters
  const bondName = "Always be growing";
  const bondSymbol = "LEARN";

  const issuerRole = await factory.ISSUER_ROLE();
  const grantIssuerRoleTx = await factory
    .connect(owner)
    .grantRole(issuerRole, owner.address);

  const allowedTokenRole = await factory.ALLOWED_TOKEN();
  const grantPaymentTokenRoleTx = await factory
    .connect(owner)
    .grantRole(allowedTokenRole, paymentToken.address);

  const grantCollateralTokenRoleTx = await factory
    .connect(owner)
    .grantRole(allowedTokenRole, collateralToken.address);

  await grantCollateralTokenRoleTx.wait();
  console.log("Collateral token allow role granted");
  await grantPaymentTokenRoleTx.wait();
  console.log("Payment token allow role granted");
  await grantIssuerRoleTx.wait();
  console.log("Factory role granted");

  const approveTokens = await collateralToken
    .connect(owner)
    .approve(factory.address, constants.MaxInt256);

  await approveTokens.wait();

  console.log("Tokens approved");
  const testMaturity = params.maturity || ConvertibleBondConfig.maturity;
  const testPaymentToken = params.paymentToken || paymentToken.address;
  const testCollateralToken = params.collateralToken || collateralToken.address;
  const testCollateralTokenAmount =
    params.collateralTokenAmount || ConvertibleBondConfig.collateralTokenAmount;
  const testConvertibleTokenAmount =
    params.convertibleTokenAmount ||
    ConvertibleBondConfig.convertibleTokenAmount;
  const testMaxSupply = params.maxSupply || ConvertibleBondConfig.maxSupply;
  const bond = await getBondContract(
    getContractAt,
    owner,
    factory
      .connect(owner)
      .createBond(
        bondName,
        bondSymbol,
        testMaturity,
        testPaymentToken,
        testCollateralToken,
        testCollateralTokenAmount,
        testConvertibleTokenAmount,
        testMaxSupply
      )
  );
  return await bond;
};

export const initiateAuction = async (
  auction: Contract,
  owner: SignerWithAddress,
  bond: Bond,
  borrowToken: TestERC20,
  auctionParams?: any
) => {
  const auctioningToken = auctionParams?.auctioningToken || bond.address;
  const biddingToken = auctionParams?.biddingToken || borrowToken.address;
  // one day from today
  const orderCancellationEndDate =
    auctionParams?.orderCancellationEndDate ||
    Math.round(
      new Date(new Date().setDate(new Date().getDate() + 1)).getTime() / 1000
    );
  // one week from today
  const auctionEndDate =
    auctionParams?.auctionEndDate ||
    Math.round(
      new Date(new Date().setDate(new Date().getDate() + 7)).getTime() / 1000
    );
  const tokenBalance = await bond.balanceOf(owner.address);
  console.log(owner.address, tokenBalance, auctioningToken);
  const _auctionedSellAmount = tokenBalance;
  const _minBuyAmount = 1;
  const minimumBiddingAmountPerOrder = 1;
  const minFundingThreshold = 0;
  const isAtomicClosureAllowed = false;
  const accessManagerContract = constants.AddressZero;
  const accessManagerContractData = constants.HashZero;
  const approveTx = await bond
    .connect(owner)
    .approve(auction.address, constants.MaxUint256);
  await approveTx.wait();

  const initiateAuctionTx = await auction
    .connect(owner)
    .initiateAuction(
      auctioningToken,
      biddingToken,
      orderCancellationEndDate,
      auctionEndDate,
      _auctionedSellAmount,
      _minBuyAmount,
      minimumBiddingAmountPerOrder,
      minFundingThreshold,
      isAtomicClosureAllowed,
      accessManagerContract,
      accessManagerContractData
    );
  return initiateAuctionTx;
};

export const getBondContract = async (
  getContractAt: Function,
  signer: SignerWithAddress,
  tx: Promise<any>
): Promise<Bond> => {
  const [newBondAddress] = await getEventArgumentsFromTransaction(
    await tx,
    "BondCreated"
  );

  return (await getContractAt("Bond", newBondAddress, signer)) as Bond;
};

async function getEventArgumentsFromTransaction(
  tx: ContractTransaction,
  eventName: string
): Promise<any> {
  const receipt = await tx.wait();
  const args = receipt?.events?.find((e: Event) => e.event === eventName)?.args;
  if (args) return args;
  console.error(`No event with name ${eventName} found in transaction`);
  return {};
}
