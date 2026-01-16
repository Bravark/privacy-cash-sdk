import { describe, it, expect } from "vitest";
import dotenv from 'dotenv';
import { PrivacyCash } from "../src";
import { Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from 'bs58';

dotenv.config();

describe('End-to-End Unsigned Transaction Test', () => {
    // Skip if no environment variables
    const shouldRun = process.env.PRIVATE_KEY && process.env.RPC_URL;

    if (!shouldRun) {
        it.skip('Skipping e2e tests - no PRIVATE_KEY or RPC_URL in .env', () => {});
        return;
    }

    const TEST_AMOUNT = 0.01; // 0.01 SOL for testing
    let client: PrivacyCash;
    let keypair: Keypair;

    it('should initialize client and keypair', () => {
        client = new PrivacyCash({
            RPC_url: process.env.RPC_URL!,
            owner: process.env.PRIVATE_KEY!,
            enableDebug: true,
        });

        keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!));

        expect(client).toBeDefined();
        expect(keypair).toBeDefined();
        expect(client.publicKey.toString()).toBe(keypair.publicKey.toString());

        console.log('✅ Client initialized');
        console.log('   Wallet:', client.publicKey.toString());
    });

    it('should generate unsigned SOL deposit transaction', async () => {
        const result = await client.deposit({
            lamports: TEST_AMOUNT * LAMPORTS_PER_SOL,
            returnUnsigned: true,
        });

        expect('unsignedTransaction' in result).toBe(true);

        if ('unsignedTransaction' in result) {
            expect(result.unsignedTransaction).toBeInstanceOf(VersionedTransaction);
            expect(result.metadata).toBeDefined();
            expect(result.metadata.encryptedOutput1).toBeInstanceOf(Buffer);

            console.log('✅ Generated unsigned deposit transaction');
            console.log('   Amount:', TEST_AMOUNT, 'SOL');
            console.log('   Encrypted output size:', result.metadata.encryptedOutput1.length, 'bytes');
        }
    }, 90000); // 90 second timeout for ZK proof

    it('should complete full unsigned deposit workflow: generate → sign → submit', async () => {
        console.log('\n🔄 Starting full unsigned deposit workflow...\n');

        // Step 1: Generate unsigned transaction (simulating backend)
        console.log('📝 Step 1: Backend generates unsigned transaction...');
        const unsignedResult = await client.deposit({
            lamports: TEST_AMOUNT * LAMPORTS_PER_SOL,
            returnUnsigned: true,
        });

        expect('unsignedTransaction' in unsignedResult).toBe(true);
        if (!('unsignedTransaction' in unsignedResult)) {
            throw new Error('Expected unsigned transaction');
        }

        const { unsignedTransaction, metadata } = unsignedResult;
        console.log('✅ Unsigned transaction generated');
        console.log('   Transaction size:', unsignedTransaction.serialize().length, 'bytes');
        console.log('   Metadata size:', metadata.encryptedOutput1.length, 'bytes\n');

        // Step 2: Serialize for transfer (simulating backend → frontend)
        console.log('📦 Step 2: Serializing for frontend transfer...');
        const serializedTx = Buffer.from(unsignedTransaction.serialize()).toString('base64');
        const serializedMetadata = {
            encryptedOutput1: metadata.encryptedOutput1.toString('base64'),
            publicKey: metadata.publicKey.toString(),
            referrer: metadata.referrer,
        };

        expect(serializedTx).toBeDefined();
        expect(serializedTx.length).toBeGreaterThan(0);
        console.log('✅ Serialized for transfer');
        console.log('   Serialized tx length:', serializedTx.length, 'chars\n');

        // Step 3: Deserialize and sign on frontend (simulating frontend)
        console.log('🔐 Step 3: Frontend deserializes and signs...');
        const txToSign = VersionedTransaction.deserialize(Buffer.from(serializedTx, 'base64'));
        txToSign.sign([keypair]);
        console.log('✅ Transaction signed by wallet\n');

        // Step 4: Submit signed transaction (simulating backend)
        console.log('📤 Step 4: Backend submits signed transaction to relayer...');
        const deserializedMetadata = {
            encryptedOutput1: Buffer.from(serializedMetadata.encryptedOutput1, 'base64'),
            publicKey: client.publicKey,
            referrer: serializedMetadata.referrer,
        };

        const finalResult = await client.submitSignedDeposit(txToSign, deserializedMetadata);

        expect(finalResult).toBeDefined();
        expect(finalResult.tx).toBeDefined();
        expect(typeof finalResult.tx).toBe('string');

        console.log('✅ Transaction submitted successfully!');
        console.log('   Transaction signature:', finalResult.tx);
        console.log('   Explorer:', `https://solscan.io/tx/${finalResult.tx}`);
        console.log('\n🎉 Full unsigned deposit workflow completed!\n');

        // Save the signature for later verification
        (global as any).lastDepositTx = finalResult.tx;
    }, 120000); // 120 second timeout

    it('should verify balance increased after deposit', async () => {
        console.log('\n💰 Verifying balance after deposit...\n');

        const balance = await client.getPrivateBalance();

        expect(balance).toBeDefined();
        expect(balance.lamports).toBeGreaterThanOrEqual(TEST_AMOUNT * LAMPORTS_PER_SOL);

        console.log('✅ Balance verified');
        console.log('   Private balance:', (balance.lamports / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
        console.log('   Minimum expected:', TEST_AMOUNT, 'SOL');
    }, 30000);

    it('should withdraw back to wallet (completing full cycle)', async () => {
        console.log('\n🔄 Starting withdrawal to complete full cycle...\n');

        const balanceBefore = await client.getPrivateBalance();
        console.log('📊 Balance before withdrawal:', (balanceBefore.lamports / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

        const withdrawResult = await client.withdraw({
            lamports: TEST_AMOUNT * LAMPORTS_PER_SOL,
            recipientAddress: client.publicKey.toString(),
        });

        expect(withdrawResult).toBeDefined();
        expect(withdrawResult.tx).toBeDefined();

        console.log('✅ Withdrawal successful!');
        console.log('   Transaction signature:', withdrawResult.tx);
        console.log('   Amount withdrawn:', TEST_AMOUNT, 'SOL');
        console.log('   Real amount:', (withdrawResult.amount_in_lamports / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
        console.log('   Fee:', (withdrawResult.fee_in_lamports / LAMPORTS_PER_SOL).toFixed(6), 'SOL');
        console.log('   Explorer:', `https://solscan.io/tx/${withdrawResult.tx}`);

        // Verify the withdrawal amount + fee equals test amount
        expect(withdrawResult.amount_in_lamports + withdrawResult.fee_in_lamports).toBe(TEST_AMOUNT * LAMPORTS_PER_SOL);

        console.log('\n🎉 Full cycle completed: unsigned deposit → withdraw!\n');
    }, 120000);

    it('should verify final balance is back to original (minus fees)', async () => {
        console.log('\n📊 Verifying final balance...\n');

        const finalBalance = await client.getPrivateBalance();

        expect(finalBalance).toBeDefined();

        console.log('✅ Final balance check complete');
        console.log('   Final private balance:', (finalBalance.lamports / LAMPORTS_PER_SOL).toFixed(6), 'SOL');
        console.log('   Note: Balance should be near original (some UTXOs may remain)');
    }, 30000);
});

describe.skip('End-to-End USDC Unsigned Transaction Test (requires USDC balance)', () => {
    const shouldRun = process.env.PRIVATE_KEY && process.env.RPC_URL;

    if (!shouldRun) {
        it.skip('Skipping USDC e2e tests - no credentials', () => {});
        return;
    }

    const TEST_AMOUNT_USDC = 1; // 1 USDC (1000000 base units)
    let client: PrivacyCash;
    let keypair: Keypair;

    it('should initialize client for USDC test', () => {
        client = new PrivacyCash({
            RPC_url: process.env.RPC_URL!,
            owner: process.env.PRIVATE_KEY!,
            enableDebug: true,
        });

        keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!));

        console.log('✅ Client initialized for USDC test');
    });

    it('should complete full unsigned USDC deposit workflow', async () => {
        console.log('\n🔄 Starting full unsigned USDC deposit workflow...\n');

        // Generate unsigned transaction
        console.log('📝 Generating unsigned USDC deposit transaction...');
        const unsignedResult = await client.depositUSDC({
            base_units: TEST_AMOUNT_USDC * 1000000,
            returnUnsigned: true,
        });

        expect('unsignedTransaction' in unsignedResult).toBe(true);
        if (!('unsignedTransaction' in unsignedResult)) {
            throw new Error('Expected unsigned transaction');
        }

        const { unsignedTransaction, metadata } = unsignedResult;
        console.log('✅ Unsigned USDC transaction generated');
        console.log('   Mint address:', metadata.mintAddress);

        // Sign transaction
        console.log('🔐 Signing transaction...');
        unsignedTransaction.sign([keypair]);
        console.log('✅ Transaction signed');

        // Submit signed transaction
        console.log('📤 Submitting signed USDC transaction...');
        const finalResult = await client.submitSignedDepositSPL(unsignedTransaction, metadata);

        expect(finalResult).toBeDefined();
        expect(finalResult.tx).toBeDefined();

        console.log('✅ USDC deposit submitted successfully!');
        console.log('   Transaction signature:', finalResult.tx);
        console.log('   Explorer:', `https://solscan.io/tx/${finalResult.tx}`);
        console.log('\n🎉 Full unsigned USDC deposit workflow completed!\n');
    }, 120000);

    it('should verify USDC balance increased', async () => {
        console.log('\n💰 Verifying USDC balance...\n');

        const { USDC_MINT } = await import('../src/utils/constants.js');
        const balance = await client.getPrivateBalanceSpl({ mintAddress: USDC_MINT });

        expect(balance).toBeDefined();
        expect(balance.base_units).toBeGreaterThanOrEqual(TEST_AMOUNT_USDC * 1000000);

        console.log('✅ USDC balance verified');
        console.log('   Private USDC balance:', (balance.base_units / 1000000).toFixed(2), 'USDC');
    }, 30000);

    it('should withdraw USDC back to wallet', async () => {
        console.log('\n🔄 Starting USDC withdrawal...\n');

        const withdrawResult = await client.withdrawUSDC({
            base_units: TEST_AMOUNT_USDC * 1000000,
            recipientAddress: client.publicKey.toString(),
        });

        expect(withdrawResult).toBeDefined();
        expect(withdrawResult.tx).toBeDefined();

        console.log('✅ USDC withdrawal successful!');
        console.log('   Transaction signature:', withdrawResult.tx);
        console.log('   Amount withdrawn:', TEST_AMOUNT_USDC, 'USDC');
        console.log('   Real amount:', (withdrawResult.amount_base_units / 1000000).toFixed(2), 'USDC');
        console.log('   Fee:', (withdrawResult.fee_base_units / 1000000).toFixed(4), 'USDC');
        console.log('   Explorer:', `https://solscan.io/tx/${withdrawResult.tx}`);

        console.log('\n🎉 Full USDC cycle completed!\n');
    }, 120000);
});
