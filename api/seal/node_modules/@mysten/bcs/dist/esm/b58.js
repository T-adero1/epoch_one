import { base58 } from "@scure/base";
const toBase58 = (buffer) => base58.encode(buffer);
const fromBase58 = (str) => base58.decode(str);
const toB58 = toBase58;
const fromB58 = fromBase58;
export {
  fromB58,
  fromBase58,
  toB58,
  toBase58
};
//# sourceMappingURL=b58.js.map
