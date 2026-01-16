## Privacy Cash SDK
This is the SDK for Privacy Cash. It has been audited by Zigtur (https://x.com/zigtur).

### Disclaimer
This SDK powers Privacy Cash's frontend, assuming the single wallet use case. If you use it or published npm library from this repo, please fully test and beware of the inherent software risks or potential bugs.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Usage

This SDK provides APIs for developers to interact with Privacy Cash relayers easily. Developers can easily deposit/withdraw/query balances in Privacy Cash solana program.

#### Main APIs

**For SOL:**
- `deposit()` - Deposit SOL into Privacy Cash
- `withdraw()` - Withdraw SOL from Privacy Cash
- `getPrivateBalance()` - Query private SOL balance

**For SPL Tokens (USDC, USDT):**
- `depositSPL()` / `depositUSDC()` - Deposit SPL tokens
- `withdrawSPL()` / `withdrawUSDC()` - Withdraw SPL tokens
- `getPrivateBalanceSpl()` - Query private SPL token balance

**Requirements:**
- Node version 24 or above
- Solana RPC endpoint
- Private key for wallet operations (or use unsigned transactions)

Check the example project under `/example` folder for complete implementation examples.

---

## 🔐 Backend-Friendly Unsigned Transactions

The SDK now supports **unsigned transaction generation**, enabling secure backend implementations without exposing private keys. This architecture separates transaction generation from signing, allowing you to:

- ✅ Generate transactions on backend without private keys
- ✅ Sign transactions on frontend with user wallets
- ✅ Submit signed transactions through backend to relayer
- ✅ Maintain complete security and privacy

### Quick Start

#### 1. Basic Usage (Automatic Signing)

Traditional approach where SDK signs transactions automatically:

```typescript
import { PrivacyCash } from 'privacycash';

const client = new PrivacyCash({
  RPC_url: 'https://api.mainnet-beta.solana.com',
  owner: 'your-private-key-base58',
});

// Deposit (signs and submits automatically)
const result = await client.deposit({
  lamports: 10000000, // 0.01 SOL
});
console.log('Transaction:', result.tx);
```

#### 2. Unsigned Transaction Flow (Recommended for Backends)

Secure approach for backend-frontend architectures:

```typescript
// ============================================
// BACKEND: Generate unsigned transaction
// ============================================
import { PrivacyCash } from 'privacycash';

const backend = new PrivacyCash({
  RPC_url: process.env.RPC_URL,
  owner: userPublicKey, // Only public key needed!
});

// Generate unsigned transaction
const result = await backend.deposit({
  lamports: 10000000, // 0.01 SOL
  returnUnsigned: true, // ← Key parameter
});

if ('unsignedTransaction' in result) {
  // Serialize for transfer to frontend
  const txData = {
    transaction: Buffer.from(result.unsignedTransaction.serialize()).toString('base64'),
    metadata: {
      encryptedOutput1: result.metadata.encryptedOutput1.toString('base64'),
      publicKey: result.metadata.publicKey.toString(),
      referrer: result.metadata.referrer,
    },
  };

  // Send to frontend
  return res.json(txData);
}

// ============================================
// FRONTEND: Sign with wallet
// ============================================
import { VersionedTransaction } from '@solana/web3.js';

// Receive unsigned transaction from backend
const { transaction, metadata } = await fetch('/api/generate-deposit').then(r => r.json());

// Deserialize transaction
const tx = VersionedTransaction.deserialize(
  Buffer.from(transaction, 'base64')
);

// Sign with user's wallet (Phantom, Solflare, etc.)
const signedTx = await wallet.signTransaction(tx);

// Send back to backend
await fetch('/api/submit-deposit', {
  method: 'POST',
  body: JSON.stringify({
    signedTransaction: Buffer.from(signedTx.serialize()).toString('base64'),
    metadata,
  }),
});

// ============================================
// BACKEND: Submit signed transaction
// ============================================
import { VersionedTransaction } from '@solana/web3.js';

// Deserialize signed transaction
const signedTx = VersionedTransaction.deserialize(
  Buffer.from(req.body.signedTransaction, 'base64')
);

// Deserialize metadata
const metadata = {
  encryptedOutput1: Buffer.from(req.body.metadata.encryptedOutput1, 'base64'),
  publicKey: new PublicKey(req.body.metadata.publicKey),
  referrer: req.body.metadata.referrer,
};

// Submit to relayer
const finalResult = await backend.submitSignedDeposit(signedTx, metadata);

console.log('Transaction confirmed:', finalResult.tx);
console.log('Explorer:', `https://solscan.io/tx/${finalResult.tx}`);
```

### API Reference

#### Deposit Methods

**`deposit(options)`**
- **Parameters:**
  - `lamports: number` - Amount in lamports (1 SOL = 1,000,000,000 lamports)
  - `returnUnsigned?: boolean` - If `true`, returns unsigned transaction
- **Returns:** `Promise<UnsignedDepositResult | SignedDepositResult>`

```typescript
// Automatic signing (default)
const result = await client.deposit({ lamports: 10000000 });

// Unsigned transaction
const result = await client.deposit({
  lamports: 10000000,
  returnUnsigned: true
});
```

**`depositUSDC(options)`**
- **Parameters:**
  - `base_units: number` - Amount in base units (1 USDC = 1,000,000 base units)
  - `returnUnsigned?: boolean` - If `true`, returns unsigned transaction
- **Returns:** `Promise<UnsignedDepositSPLResult | SignedDepositSPLResult>`

```typescript
const result = await client.depositUSDC({
  base_units: 1000000, // 1 USDC
  returnUnsigned: true
});
```

**`depositSPL(options)`**
- **Parameters:**
  - `base_units: number` - Amount in base units
  - `mintAddress: PublicKey | string` - SPL token mint address
  - `returnUnsigned?: boolean` - If `true`, returns unsigned transaction
- **Returns:** `Promise<UnsignedDepositSPLResult | SignedDepositSPLResult>`

```typescript
const result = await client.depositSPL({
  base_units: 1000000,
  mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  returnUnsigned: true
});
```

#### Submit Methods

**`submitSignedDeposit(signedTransaction, metadata)`**
- **Parameters:**
  - `signedTransaction: VersionedTransaction` - Signed transaction from frontend
  - `metadata: UnsignedDepositResult['metadata']` - Metadata from unsigned result
- **Returns:** `Promise<{ tx: string }>` - Transaction signature

```typescript
const result = await client.submitSignedDeposit(signedTx, metadata);
console.log('Transaction:', result.tx);
```

**`submitSignedDepositSPL(signedTransaction, metadata)`**
- **Parameters:**
  - `signedTransaction: VersionedTransaction` - Signed transaction from frontend
  - `metadata: UnsignedDepositSPLResult['metadata']` - Metadata from unsigned result
- **Returns:** `Promise<{ tx: string }>` - Transaction signature

```typescript
const result = await client.submitSignedDepositSPL(signedTx, metadata);
console.log('Transaction:', result.tx);
```

### Type Definitions

```typescript
import type {
  UnsignedDepositResult,
  SignedDepositResult,
  UnsignedDepositSPLResult,
  SignedDepositSPLResult,
} from 'privacycash';

// Unsigned SOL deposit result
type UnsignedDepositResult = {
  unsignedTransaction: VersionedTransaction;
  metadata: {
    encryptedOutput1: Buffer;
    publicKey: PublicKey;
    referrer?: string;
  };
};

// Signed deposit result
type SignedDepositResult = {
  tx: string; // Transaction signature
};

// Unsigned SPL deposit result (includes mintAddress)
type UnsignedDepositSPLResult = {
  unsignedTransaction: VersionedTransaction;
  metadata: {
    encryptedOutput1: Buffer;
    publicKey: PublicKey;
    referrer?: string;
    mintAddress: string;
  };
};
```

### Complete Example: Express Backend + React Frontend

#### Backend (Express.js)

```typescript
import express from 'express';
import { PrivacyCash } from 'privacycash';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';

const app = express();
app.use(express.json());

// Generate unsigned deposit transaction
app.post('/api/deposit/generate', async (req, res) => {
  const { userPublicKey, amount } = req.body;

  const client = new PrivacyCash({
    RPC_url: process.env.RPC_URL,
    owner: userPublicKey, // No private key needed!
  });

  const result = await client.deposit({
    lamports: amount,
    returnUnsigned: true,
  });

  if ('unsignedTransaction' in result) {
    res.json({
      transaction: Buffer.from(result.unsignedTransaction.serialize()).toString('base64'),
      metadata: {
        encryptedOutput1: result.metadata.encryptedOutput1.toString('base64'),
        publicKey: result.metadata.publicKey.toString(),
      },
    });
  }
});

// Submit signed transaction
app.post('/api/deposit/submit', async (req, res) => {
  const { signedTransaction, metadata, userPublicKey } = req.body;

  const client = new PrivacyCash({
    RPC_url: process.env.RPC_URL,
    owner: userPublicKey,
  });

  const tx = VersionedTransaction.deserialize(
    Buffer.from(signedTransaction, 'base64')
  );

  const meta = {
    encryptedOutput1: Buffer.from(metadata.encryptedOutput1, 'base64'),
    publicKey: new PublicKey(metadata.publicKey),
  };

  const result = await client.submitSignedDeposit(tx, meta);

  res.json({ signature: result.tx });
});

app.listen(3000);
```

#### Frontend (React + Wallet Adapter)

```typescript
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';

function DepositButton() {
  const { publicKey, signTransaction } = useWallet();

  const handleDeposit = async () => {
    // 1. Generate unsigned transaction from backend
    const response = await fetch('/api/deposit/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPublicKey: publicKey.toString(),
        amount: 10000000, // 0.01 SOL
      }),
    });

    const { transaction, metadata } = await response.json();

    // 2. Deserialize and sign
    const tx = VersionedTransaction.deserialize(
      Buffer.from(transaction, 'base64')
    );

    const signedTx = await signTransaction(tx);

    // 3. Send back to backend for submission
    const submitResponse = await fetch('/api/deposit/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedTransaction: Buffer.from(signedTx.serialize()).toString('base64'),
        metadata,
        userPublicKey: publicKey.toString(),
      }),
    });

    const { signature } = await submitResponse.json();
    console.log('Deposit successful:', signature);
  };

  return <button onClick={handleDeposit}>Deposit 0.01 SOL</button>;
}
```

### Backward Compatibility

The SDK maintains 100% backward compatibility. Existing code continues to work without modifications:

```typescript
// Old code (still works)
const result = await client.deposit({ lamports: 10000000 });
// Returns: { tx: 'signature...' }

// New code (opt-in)
const result = await client.deposit({
  lamports: 10000000,
  returnUnsigned: true
});
// Returns: { unsignedTransaction: ..., metadata: ... }
```

### Security Benefits

✅ **Private keys never leave the user's device**
✅ **Backend cannot sign transactions on behalf of users**
✅ **Full audit trail of all transactions**
✅ **Compatible with hardware wallets**
✅ **Follows Solana wallet adapter standards**

### Testing

The SDK includes comprehensive tests covering:
- ✅ Type definitions and exports
- ✅ Unsigned transaction generation
- ✅ Transaction serialization/deserialization
- ✅ Signed transaction submission
- ✅ Full deposit-withdraw cycles
- ✅ Real on-chain transaction confirmation

Run tests:
```bash
npm test
```

### Tests
1. To run unit tests:
```
    npm test
```
2. To run e2e test (on Mainnet), you need to put your private key (PRIVATE_KEY) inside .env file under the project root directory, and then run:
```
    npm run teste2e
```
Running e2e tests will cost some transaction fees on your wallet, so don't put too much SOL into your wallet. Maybe put 0.1 SOL, and the tests might cost 0.02 SOL.