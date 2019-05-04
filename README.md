# DigiAssets SDK

Easy to use SDK for issuing and transferring digital assets using DigiAssets on top of DigiByte blockchain technology.
Coupled with state-of-the-art [BIP32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) & [BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) hierarchical deterministic wallet to hold your assets.

You can find a more detailed guide of using the sdk here in the [DigiAssets Getting Started Wiki](https://github.com/DigiByte-Core/DigiAssets-Protocol-Specifications/wiki/Getting%20Started)

## Installation

```sh
$ npm i digiassets-sdk
```
## Usage

```js
var DigiAssets = require('digiassets-sdk')
var da = new DigiAssets()
da.init(function (err) {
  // Colored-Coins SDK is now ready
})
```

## Testing
```shell
$ mocha
```
Note: without some configuration, some tests (all those which actually need funding) will fail. <br>
In order for all the tests to pass, you'll need to have some funds, i.e. Bitcoins (or testnet-coins when `network` is `'testnet'`). <br>
Do this by creating a JSON file, which includes `privateSeed` \ `mnemonic` where which the address in the [BIP44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki) path m/44'/0'/0'/0/0 for mainnet (m/44'/1'/0'/0/0 for tetsnet) has enough Bitcoins (or testnet-coins):
```shell
$ cd /path/to/coloredcoins-sdk
$ echo '{"network":"testnet", "privateSeed":"YourPrivateSeed"}' >> test/settings.json
$ mocha
```

## License

[Apache-2.0](http://www.apache.org/licenses/LICENSE-2.0)
