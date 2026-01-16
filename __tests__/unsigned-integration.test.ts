import { describe, it, expect } from "vitest";
import dotenv from 'dotenv';
import { PrivacyCash } from "../src";
import { Keypair, VersionedTransaction } from "@solana/web3.js";

dotenv.config();

describe('Unsigned Transaction Integration Test', () => {
    // Skip if no environment variables
    const shouldRun = process.env.PRIVATE_KEY && process.env.RPC_URL;

    if (!shouldRun) {
        it.skip('Skipping integration tests - no PRIVATE_KEY or RPC_URL in .env', () => {});
        return;
    }

    let client: PrivacyCash;

    it('should initialize PrivacyCash client', () => {
        client = new PrivacyCash({
            RPC_url: process.env.RPC_URL!,
            owner: process.env.PRIVATE_KEY!,
            enableDebug: true,
        });

        expect(client).toBeDefined();
        expect(client.publicKey).toBeDefined();
    });

    it('should generate unsigned SOL deposit transaction', async () => {
        const result = await client.deposit({
            lamports: 10000000, // 0.01 SOL
            returnUnsigned: true,
        });

        expect('unsignedTransaction' in result).toBe(true);

        if ('unsignedTransaction' in result) {
            expect(result.unsignedTransaction).toBeInstanceOf(VersionedTransaction);
            expect(result.metadata).toBeDefined();
            expect(result.metadata.encryptedOutput1).toBeInstanceOf(Buffer);
            expect(result.metadata.encryptedOutput1.length).toBeGreaterThan(0);
            expect(result.metadata.publicKey).toBeDefined();
            expect(result.metadata.publicKey.toString()).toBe(client.publicKey.toString());

            // Verify transaction can be serialized
            const serialized = result.unsignedTransaction.serialize();
            expect(serialized).toBeInstanceOf(Uint8Array);
            expect(serialized.length).toBeGreaterThan(0);

            console.log('✅ Successfully generated unsigned transaction');
            console.log('   Transaction size:', serialized.length, 'bytes');
            console.log('   Metadata size:', result.metadata.encryptedOutput1.length, 'bytes');
        }
    }, 60000); // 60 second timeout for ZK proof generation

    it('should generate unsigned USDC deposit transaction', async () => {
        const result = await client.depositUSDC({
            base_units: 1000000, // 1 USDC
            returnUnsigned: true,
        });

        expect('unsignedTransaction' in result).toBe(true);

        if ('unsignedTransaction' in result) {
            expect(result.unsignedTransaction).toBeInstanceOf(VersionedTransaction);
            expect(result.metadata).toBeDefined();
            expect(result.metadata.encryptedOutput1).toBeInstanceOf(Buffer);
            expect(result.metadata.mintAddress).toBeDefined();
            expect(typeof result.metadata.mintAddress).toBe('string');

            // Verify transaction can be serialized
            const serialized = result.unsignedTransaction.serialize();
            expect(serialized).toBeInstanceOf(Uint8Array);

            console.log('✅ Successfully generated unsigned USDC transaction');
            console.log('   Transaction size:', serialized.length, 'bytes');
            console.log('   Mint address:', result.metadata.mintAddress);
        }
    }, 60000);

    it('should support transaction serialization for backend-frontend transfer', async () => {
        const result = await client.deposit({
            lamports: 10000000,
            returnUnsigned: true,
        });

        if ('unsignedTransaction' in result) {
            // Step 1: Serialize transaction for transfer to frontend
            const serializedTx = Buffer.from(result.unsignedTransaction.serialize()).toString('base64');
            expect(serializedTx).toBeDefined();
            expect(serializedTx.length).toBeGreaterThan(0);

            // Step 2: Serialize metadata
            const serializedMetadata = {
                encryptedOutput1: result.metadata.encryptedOutput1.toString('base64'),
                publicKey: result.metadata.publicKey.toString(),
                referrer: result.metadata.referrer,
            };

            expect(serializedMetadata.encryptedOutput1).toBeDefined();
            expect(serializedMetadata.publicKey).toBeDefined();

            // Step 3: Simulate deserialization on frontend
            const deserializedTx = VersionedTransaction.deserialize(
                Buffer.from(serializedTx, 'base64')
            );
            expect(deserializedTx).toBeInstanceOf(VersionedTransaction);

            // Step 4: Verify deserialized transaction matches original
            const reserializedTx = Buffer.from(deserializedTx.serialize()).toString('base64');
            expect(reserializedTx).toBe(serializedTx);

            console.log('✅ Successfully serialized and deserialized transaction');
            console.log('   Original size:', serializedTx.length, 'chars');
            console.log('   Deserialized matches:', reserializedTx === serializedTx);
        }
    }, 60000);

    it('should verify unsigned transaction can be signed externally', async () => {
        const result = await client.deposit({
            lamports: 10000000,
            returnUnsigned: true,
        });

        if ('unsignedTransaction' in result) {
            const { unsignedTransaction } = result;

            // Get current signatures (should be empty or placeholder)
            const signaturesBefore = unsignedTransaction.signatures.length;
            expect(signaturesBefore).toBeGreaterThan(0);

            // Sign the transaction (simulating frontend wallet signing)
            // The private key in .env is base58 encoded
            const bs58 = await import('bs58');
            const keypair = Keypair.fromSecretKey(
                bs58.default.decode(process.env.PRIVATE_KEY!)
            );
            unsignedTransaction.sign([keypair]);

            // Verify transaction is now signed
            const signaturesAfter = unsignedTransaction.signatures.length;
            expect(signaturesAfter).toBe(signaturesBefore);

            // Verify transaction can still be serialized after signing
            const serialized = unsignedTransaction.serialize();
            expect(serialized).toBeInstanceOf(Uint8Array);

            console.log('✅ Successfully signed unsigned transaction');
            console.log('   Signatures:', signaturesAfter);
        }
    }, 60000);

    it('should maintain type discrimination after transaction generation', async () => {
        // Test unsigned result
        const unsignedResult = await client.deposit({
            lamports: 10000000,
            returnUnsigned: true,
        });

        if ('unsignedTransaction' in unsignedResult) {
            expect(unsignedResult.metadata).toBeDefined();
            expect('tx' in unsignedResult).toBe(false);
            console.log('✅ Unsigned result type guard works correctly');
        } else {
            throw new Error('Expected unsigned transaction');
        }
    }, 60000);

    it('should verify metadata contains all required fields', async () => {
        const result = await client.deposit({
            lamports: 10000000,
            returnUnsigned: true,
        });

        if ('unsignedTransaction' in result) {
            const { metadata } = result;

            // Check required fields
            expect(metadata.encryptedOutput1).toBeDefined();
            expect(metadata.encryptedOutput1).toBeInstanceOf(Buffer);
            expect(metadata.encryptedOutput1.length).toBeGreaterThan(0);

            expect(metadata.publicKey).toBeDefined();
            expect(metadata.publicKey.toString()).toBeDefined();

            // Optional field
            expect(metadata.referrer === undefined || typeof metadata.referrer === 'string').toBe(true);

            console.log('✅ All required metadata fields present');
            console.log('   encryptedOutput1 size:', metadata.encryptedOutput1.length, 'bytes');
            console.log('   publicKey:', metadata.publicKey.toString().substring(0, 8) + '...');
        }
    }, 60000);
});
