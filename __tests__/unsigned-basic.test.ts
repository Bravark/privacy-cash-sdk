import { describe, it, expect } from "vitest";
import type { UnsignedDepositResult, SignedDepositResult } from "../src/deposit";
import type { UnsignedDepositSPLResult, SignedDepositSPLResult } from "../src/depositSPL";
import { VersionedTransaction, PublicKey } from "@solana/web3.js";

describe('Unsigned Transaction Type Definitions', () => {
    describe('Type exports and structure', () => {
        it('should export UnsignedDepositResult type', () => {
            // Type check only - verifies the type exists
            const mockResult: UnsignedDepositResult = {
                unsignedTransaction: {} as VersionedTransaction,
                metadata: {
                    encryptedOutput1: Buffer.from('test'),
                    publicKey: PublicKey.default,
                },
            };

            expect(mockResult.unsignedTransaction).toBeDefined();
            expect(mockResult.metadata).toBeDefined();
            expect(mockResult.metadata.encryptedOutput1).toBeInstanceOf(Buffer);
        });

        it('should export SignedDepositResult type', () => {
            const mockResult: SignedDepositResult = {
                tx: 'test-signature',
            };

            expect(mockResult.tx).toBe('test-signature');
        });

        it('should export UnsignedDepositSPLResult type with mintAddress', () => {
            const mockResult: UnsignedDepositSPLResult = {
                unsignedTransaction: {} as VersionedTransaction,
                metadata: {
                    encryptedOutput1: Buffer.from('test'),
                    publicKey: PublicKey.default,
                    mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                },
            };

            expect(mockResult.metadata.mintAddress).toBeDefined();
        });

        it('should export SignedDepositSPLResult type', () => {
            const mockResult: SignedDepositSPLResult = {
                tx: 'test-spl-signature',
            };

            expect(mockResult.tx).toBe('test-spl-signature');
        });
    });

    describe('Type guards for discriminated unions', () => {
        it('should allow discriminating between unsigned and signed results for SOL', () => {
            const unsignedResult: UnsignedDepositResult | SignedDepositResult = {
                unsignedTransaction: {} as VersionedTransaction,
                metadata: {
                    encryptedOutput1: Buffer.from('test'),
                    publicKey: PublicKey.default,
                },
            };

            if ('unsignedTransaction' in unsignedResult) {
                expect(unsignedResult.metadata).toBeDefined();
            } else {
                throw new Error('Should be unsigned');
            }
        });

        it('should allow discriminating between unsigned and signed results for SPL', () => {
            const unsignedResult: UnsignedDepositSPLResult | SignedDepositSPLResult = {
                unsignedTransaction: {} as VersionedTransaction,
                metadata: {
                    encryptedOutput1: Buffer.from('test'),
                    publicKey: PublicKey.default,
                    mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                },
            };

            if ('unsignedTransaction' in unsignedResult) {
                expect(unsignedResult.metadata.mintAddress).toBeDefined();
            } else {
                throw new Error('Should be unsigned');
            }
        });

        it('should handle signed result type guard', () => {
            const signedResult: UnsignedDepositResult | SignedDepositResult = {
                tx: 'signature-123',
            };

            if ('tx' in signedResult) {
                expect(signedResult.tx).toBe('signature-123');
            } else {
                throw new Error('Should be signed');
            }
        });
    });

    describe('Metadata serialization compatibility', () => {
        it('should allow serialization of metadata for transfer to frontend', () => {
            const metadata: UnsignedDepositResult['metadata'] = {
                encryptedOutput1: Buffer.from('encrypted-data'),
                publicKey: PublicKey.default,
                referrer: 'test-referrer',
            };

            // Simulate serialization
            const serialized = {
                encryptedOutput1: metadata.encryptedOutput1.toString('base64'),
                publicKey: metadata.publicKey.toString(),
                referrer: metadata.referrer,
            };

            expect(serialized.encryptedOutput1).toBe(metadata.encryptedOutput1.toString('base64'));
            expect(serialized.publicKey).toBe(metadata.publicKey.toString());
            expect(serialized.referrer).toBe('test-referrer');

            // Simulate deserialization
            const deserialized = {
                encryptedOutput1: Buffer.from(serialized.encryptedOutput1, 'base64'),
                publicKey: new PublicKey(serialized.publicKey),
                referrer: serialized.referrer,
            };

            expect(deserialized.encryptedOutput1.toString('base64')).toBe(
                metadata.encryptedOutput1.toString('base64')
            );
            expect(deserialized.publicKey.toString()).toBe(metadata.publicKey.toString());
        });

        it('should allow serialization of SPL metadata', () => {
            const metadata: UnsignedDepositSPLResult['metadata'] = {
                encryptedOutput1: Buffer.from('encrypted-data'),
                publicKey: PublicKey.default,
                mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            };

            const serialized = {
                encryptedOutput1: metadata.encryptedOutput1.toString('base64'),
                publicKey: metadata.publicKey.toString(),
                mintAddress: metadata.mintAddress,
            };

            expect(serialized.mintAddress).toBe(metadata.mintAddress);
        });
    });

    describe('Optional fields handling', () => {
        it('should handle metadata without optional referrer', () => {
            const metadata: UnsignedDepositResult['metadata'] = {
                encryptedOutput1: Buffer.from('test'),
                publicKey: PublicKey.default,
                // referrer is optional
            };

            expect(metadata.referrer).toBeUndefined();
        });

        it('should handle metadata with optional referrer', () => {
            const metadata: UnsignedDepositResult['metadata'] = {
                encryptedOutput1: Buffer.from('test'),
                publicKey: PublicKey.default,
                referrer: 'referrer-address',
            };

            expect(metadata.referrer).toBe('referrer-address');
        });
    });
});
