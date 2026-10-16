import {
  isAddress,
  parseAbi,
  stringToHex,
  zeroAddress,
  recoverAddress,
  type Address,
  type Hex,
} from "viem";
import { services, type Runtime } from "./config";
import { reader, same } from "./data";
import { parseAttestation } from "./model";
export const ORACLE_PRICE = 500000000000000000n;
export const intakeABI = parseAbi([
  "function priceOf(bytes32 action, address asset) view returns (uint256)",
  "function request(bytes32 action, bytes body, (address target, bytes4 selector) callback, address asset, uint256 amount) payable returns (bytes32 requestId)",
]);
export function oracleBody(question: string, game: Address) {
  return {
    v: 1,
    question,
    chainId: 1,
    window: { hours: 24 },
    answerType: "uint256",
    evidence: "panel",
    panelSize: 20,
    quorum: 14,
    validForSeconds: 86400,
    consumer: { chainId: 1, verifyingContract: game },
  };
}
export async function fetchJSON(path: string, init?: RequestInit) {
  const response = await fetch(`${services.oracleAPI}${path}`, {
    signal: AbortSignal.timeout(15000),
    ...init,
  });
  if (!response.ok)
    throw Error(
      `The oracle service could not answer (${response.status}). Try again.`,
    );
  return response.json();
}
export async function intakeRoute(r: Runtime, imd: Address) {
  const capabilities = await fetchJSON("/requests/capabilities");
  const chain = capabilities.onchain?.chains?.find((c: any) => c.chainId === 1);
  const action = chain?.actions?.find(
    (a: any) => a.action === "oracle.request" && a.version === "oracle-1",
  );
  const actionId = stringToHex("oracle.request@oracle-1", { size: 32 });
  if (
    !chain ||
    !isAddress(chain.intake) ||
    !same(chain.asset, imd) ||
    action?.actionId !== actionId ||
    BigInt(action.amount) !== ORACLE_PRICE
  )
    throw Error(
      "The oracle payment route or price has changed. Review the protocol before paying.",
    );
  const address = chain.intake as Address;
  const [code, price] = await Promise.all([
    r.client.getCode({ address }),
    r.client.readContract({
      address,
      abi: intakeABI,
      functionName: "priceOf",
      args: [actionId, imd],
    }),
  ]);
  if (!code || code === "0x" || price !== ORACLE_PRICE)
    throw Error(
      "The oracle’s on-chain price could not be confirmed as 0.5 IMD.",
    );
  return { address, actionId, price };
}
export function intakeCall(
  route: { address: Address; actionId: Hex; price: bigint },
  imd: Address,
  body: ReturnType<typeof oracleBody>,
) {
  // The protocol defines this tuple as 'no callback'. It is not a recipient placeholder.
  // HamsterHour is the explicit EIP-712 consumer in the JSON; settlement is a later wallet call.
  return {
    address: route.address,
    abi: intakeABI,
    functionName: "request",
    args: [
      route.actionId,
      stringToHex(JSON.stringify(body)),
      { target: zeroAddress, selector: stringToHex("", { size: 4 }) },
      imd,
      route.price,
    ],
  };
}
export const isUUID = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
export async function intakeProgress(
  tx: Hex,
  intake?: Address,
  payer?: Address,
) {
  const response = await fetch(`${services.oracleAPI}/intake/1/${tx}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404)
    return { state: "Waiting for the protocol to see your payment" };
  if (!response.ok)
    throw Error(
      "Payment tracking could not refresh. Your saved transaction will be checked again.",
    );
  const record = await response.json();
  const entry = record.entries?.find(
    (e: any) =>
      e.action === "oracle.request" &&
      (!intake || same(e.intake, intake)) &&
      (!payer || same(e.payer, payer)),
  );
  if (!entry) return { state: "Waiting for the oracle request" };
  if (["refused", "failed"].includes(entry.state))
    throw Error(
      `The oracle request was ${entry.state}${entry.reason ? `: ${entry.reason}` : ""}. The protocol does not refund this payment. Manual results can still be used.`,
    );
  const result = entry.admission?.result;
  const uuid = isUUID(result?.requestId) ? result.requestId : undefined;
  return {
    state: uuid
      ? "Panel is answering the question"
      : `Protocol status: ${entry.state}`,
    uuid,
    job: isUUID(result?.jobId) ? result.jobId : undefined,
  };
}
export async function validateAttestation(
  r: Runtime,
  k: bigint,
  text: string,
  now: number,
) {
  const a = parseAttestation(text, r.chain.id, r.game.address),
    m = a.attestation;
  const [expected, signer, digest, w] = await Promise.all([
    reader(r)<Hex>("questionHash", [k, m.fromBlock, m.toBlock]),
    r.client.readContract({
      address: r.verifier.address,
      abi: r.verifier.abi,
      functionName: "oracleSigner",
    }) as Promise<Address>,
    r.client.readContract({
      address: r.verifier.address,
      abi: r.verifier.abi,
      functionName: "attestationDigest",
      args: [m, r.game.address],
    }) as Promise<Hex>,
    reader(r)<{ endsAt: bigint }>("window", [k]),
  ]);
  if (expected !== m.questionHash)
    throw Error("This answer belongs to a different window or question.");
  if (
    !same(
      await recoverAddress({ hash: digest, signature: a.signature }),
      signer,
    )
  )
    throw Error(
      "The oracle signature does not match the game’s trusted signer.",
    );
  if (
    Number(m.agreed) < Number(m.quorum) ||
    Number(m.panelSize) < 5 ||
    Number(m.quorum) < 4 ||
    Number(m.agreed) > Number(m.panelSize)
  )
    throw Error("This panel does not meet the game’s agreement requirements.");
  const timestamp = BigInt(Math.floor(now / 1000));
  if (
    (m.issuedAt as bigint) < w.endsAt ||
    (m.issuedAt as bigint) > timestamp + 300n ||
    (m.expiresAt as bigint) < timestamp ||
    (m.issuedAt as bigint) > (m.expiresAt as bigint)
  )
    throw Error("This signed answer is too early or has expired.");
  if ((m.fromBlock as bigint) > (m.toBlock as bigint))
    throw Error("The signed block range is invalid.");
  return a;
}
