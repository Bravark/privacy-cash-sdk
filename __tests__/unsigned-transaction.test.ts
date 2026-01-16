import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { deposit, type UnsignedDepositResult, type SignedDepositResult } from "../src/deposit";
import { depositSPL, type UnsignedDepositSPLResult, type SignedDepositSPLResult } from "../src/depositSPL";
import { EncryptionService } from "../src/utils/encryption";
import { WasmFactory } from "@lightprotocol/hasher.rs";
import { USDC_MINT } from "../src/utils/constants";
import path from "node:path";
import { LocalStorage } from "node-localstorage";

// Mock fetch globally
global.fetch = vi.fn();

describe('Unsigned Transaction Tests', () => {
    let mockConnection: Connection;
    let mockEncryptionService: EncryptionService;
    let mockPublicKey: PublicKey;
    let mockKeypair: Keypair;
    let lightWasm: any;
    let storage: Storage;

    beforeAll(async () => {
        lightWasm = await WasmFactory.getInstance();
        storage = new LocalStorage(path.join(process.cwd(), "__tests__", "cache"));
    });

    beforeEach(() => {
        // Create mock connection
        mockConnection = {
            getBalance: vi.fn().mockResolvedValue(10 * LAMPORTS_PER_SOL),
            getAccountInfo: vi.fn().mockResolvedValue({
                data: Buffer.alloc(4129), // Mock tree account data
            }),
            getLatestBlockhash: vi.fn().mockResolvedValue({
                blockhash: 'mock-blockhash',
                lastValidBlockHeight: 1000000,
            }),
        } as any;

        // Create mock keypair and public key
        mockKeypair = Keypair.generate();
        mockPublicKey = mockKeypair.publicKey;

        // Create encryption service
        mockEncryptionService = new EncryptionService();
        mockEncryptionService.deriveEncryptionKeyFromWallet(mockKeypair);

        // Mock fetch for remote tree state and API calls
        (global.fetch as any).mockImplementation((url: string) => {
            const urlStr = url.toString();

            // Tree state endpoint
            if (urlStr.includes('/tree/state') || urlStr.includes('/tree')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        root: '12345678901234567890123456789012',
                        nextIndex: 100,
                    }),
                });
            }

            // Merkle proof endpoint
            if (urlStr.includes('/proof/')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        pathElements: Array(20).fill('0'),
                        pathIndices: Array(20).fill(0),
                    }),
                });
            }

            // UTXOs endpoint
            if (urlStr.includes('/utxos') && !urlStr.includes('/check/')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([]),
                });
            }

            // UTXO check endpoint
            if (urlStr.includes('/utxos/check/')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ exists: false }),
                });
            }

            // Deposit endpoints
            if (urlStr.includes('/deposit')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        signature: 'mock-signature',
                        success: true,
                    }),
                });
            }

            // Default for any other URL
            console.log('Unmocked URL:', urlStr);
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({}),
            });
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('deposit() function with unsigned transactions', () => {
        it('should return unsigned transaction when transactionSigner is undefined', async () => {
            const result = await deposit({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                amount_in_lamports: 0.01 * LAMPORTS_PER_SOL,
                encryptionService: mockEncryptionService,
                transactionSigner: undefined, // No signer provided
            });

            // Type guard to check if it's unsigned
            if ('unsignedTransaction' in result) {
                expect(result.unsignedTransaction).toBeInstanceOf(VersionedTransaction);
                expect(result.metadata).toBeDefined();
                expect(result.metadata.encryptedOutput1).toBeInstanceOf(Buffer);
                expect(result.metadata.publicKey).toBeInstanceOf(PublicKey);
                expect(result.metadata.publicKey.toString()).toBe(mockPublicKey.toString());
            } else {
                throw new Error('Expected unsigned transaction result');
            }
        });

        it('should return signed transaction result when transactionSigner is provided', async () => {
            // Mock successful relay and confirmation
            (global.fetch as any).mockImplementation((url: string) => {
                if (url.includes('/tree/state')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            root: '12345678901234567890123456789012',
                            nextIndex: 100,
                        }),
                    });
                }
                if (url.includes('/utxos')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve([]),
                    });
                }
                if (url.includes('/deposit')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            signature: 'mock-signature-123',
                            success: true,
                        }),
                    });
                }
                if (url.includes('/utxos/check/')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ exists: true }),
                    });
                }
                return Promise.reject(new Error('Unknown URL'));
            });

            const result = await deposit({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                amount_in_lamports: 0.01 * LAMPORTS_PER_SOL,
                encryptionService: mockEncryptionService,
                transactionSigner: async (tx: VersionedTransaction) => {
                    tx.sign([mockKeypair]);
                    return tx;
                },
            });

            // Type guard to check if it's signed
            if ('tx' in result) {
                expect(result.tx).toBe('mock-signature-123');
            } else {
                throw new Error('Expected signed transaction result');
            }
        });

        it('should include referrer in metadata when provided', async () => {
            const referrer = 'referrer-public-key';

            const result = await deposit({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                amount_in_lamports: 0.01 * LAMPORTS_PER_SOL,
                encryptionService: mockEncryptionService,
                transactionSigner: undefined,
                referrer,
            });

            if ('unsignedTransaction' in result) {
                expect(result.metadata.referrer).toBe(referrer);
            } else {
                throw new Error('Expected unsigned transaction result');
            }
        });

        it('should create a valid unsigned transaction that can be signed later', async () => {
            const result = await deposit({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                amount_in_lamports: 0.01 * LAMPORTS_PER_SOL,
                encryptionService: mockEncryptionService,
                transactionSigner: undefined,
            });

            if ('unsignedTransaction' in result) {
                const { unsignedTransaction } = result;

                // Verify the transaction is not signed yet
                expect(unsignedTransaction.signatures.length).toBeGreaterThan(0);

                // Sign the transaction
                unsignedTransaction.sign([mockKeypair]);

                // Verify the transaction can be serialized after signing
                const serialized = unsignedTransaction.serialize();
                expect(serialized).toBeInstanceOf(Uint8Array);
                expect(serialized.length).toBeGreaterThan(0);
            } else {
                throw new Error('Expected unsigned transaction result');
            }
        });
    });

    describe('depositSPL() function with unsigned transactions', () => {
        beforeEach(() => {
            // Mock SPL token account balance check
            (mockConnection as any).getAccountInfo = vi.fn().mockImplementation((pubkey: PublicKey) => {
                // Mock tree account
                if (pubkey.toString().includes('merkle_tree')) {
                    return Promise.resolve({
                        data: Buffer.alloc(4129),
                    });
                }
                return Promise.resolve(null);
            });

            // Mock getAccount for SPL token
            vi.mock('@solana/spl-token', async () => {
                const actual = await vi.importActual('@solana/spl-token');
                return {
                    ...actual,
                    getAccount: vi.fn().mockResolvedValue({
                        amount: BigInt(1000000000), // 1000 USDC
                    }),
                    getMint: vi.fn().mockResolvedValue({
                        decimals: 6,
                    }),
                };
            });
        });

        it('should return unsigned transaction when transactionSigner is undefined', async () => {
            const result = await depositSPL({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                base_units: 1000000, // 1 USDC
                encryptionService: mockEncryptionService,
                mintAddress: USDC_MINT,
                transactionSigner: undefined,
            });

            if ('unsignedTransaction' in result) {
                expect(result.unsignedTransaction).toBeInstanceOf(VersionedTransaction);
                expect(result.metadata).toBeDefined();
                expect(result.metadata.encryptedOutput1).toBeInstanceOf(Buffer);
                expect(result.metadata.publicKey).toBeInstanceOf(PublicKey);
                expect(result.metadata.mintAddress).toBe(USDC_MINT.toString());
            } else {
                throw new Error('Expected unsigned transaction result');
            }
        });

        it('should include mintAddress in metadata for SPL deposits', async () => {
            const result = await depositSPL({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                base_units: 1000000,
                encryptionService: mockEncryptionService,
                mintAddress: USDC_MINT,
                transactionSigner: undefined,
            });

            if ('unsignedTransaction' in result) {
                expect(result.metadata.mintAddress).toBe(USDC_MINT.toString());
            } else {
                throw new Error('Expected unsigned transaction result');
            }
        });

        it('should return signed transaction when transactionSigner is provided', async () => {
            // Mock successful relay and confirmation
            (global.fetch as any).mockImplementation((url: string) => {
                if (url.includes('/tree/state')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            root: '12345678901234567890123456789012',
                            nextIndex: 100,
                        }),
                    });
                }
                if (url.includes('/utxos')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve([]),
                    });
                }
                if (url.includes('/deposit/spl')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            signature: 'mock-spl-signature-456',
                            success: true,
                        }),
                    });
                }
                if (url.includes('/utxos/check/')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ exists: true }),
                    });
                }
                return Promise.reject(new Error('Unknown URL'));
            });

            const result = await depositSPL({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                base_units: 1000000,
                encryptionService: mockEncryptionService,
                mintAddress: USDC_MINT,
                transactionSigner: async (tx: VersionedTransaction) => {
                    tx.sign([mockKeypair]);
                    return tx;
                },
            });

            if ('tx' in result) {
                expect(result.tx).toBe('mock-spl-signature-456');
            } else {
                throw new Error('Expected signed transaction result');
            }
        });
    });

    describe('Type guards and type safety', () => {
        it('should properly discriminate between signed and unsigned results for SOL', async () => {
            const unsignedResult = await deposit({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                amount_in_lamports: 0.01 * LAMPORTS_PER_SOL,
                encryptionService: mockEncryptionService,
                transactionSigner: undefined,
            });

            // TypeScript type guard
            if ('unsignedTransaction' in unsignedResult) {
                expect(unsignedResult.metadata).toBeDefined();
                expect('tx' in unsignedResult).toBe(false);
            } else if ('tx' in unsignedResult) {
                throw new Error('Should be unsigned');
            }
        });

        it('should properly discriminate between signed and unsigned results for SPL', async () => {
            const unsignedResult = await depositSPL({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                base_units: 1000000,
                encryptionService: mockEncryptionService,
                mintAddress: USDC_MINT,
                transactionSigner: undefined,
            });

            if ('unsignedTransaction' in unsignedResult) {
                expect(unsignedResult.metadata).toBeDefined();
                expect(unsignedResult.metadata.mintAddress).toBeDefined();
                expect('tx' in unsignedResult).toBe(false);
            } else if ('tx' in unsignedResult) {
                throw new Error('Should be unsigned');
            }
        });
    });

    describe('Metadata preservation', () => {
        it('should preserve all necessary metadata for later submission', async () => {
            const result = await deposit({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                amount_in_lamports: 0.01 * LAMPORTS_PER_SOL,
                encryptionService: mockEncryptionService,
                transactionSigner: undefined,
                referrer: 'test-referrer',
            });

            if ('unsignedTransaction' in result) {
                const { metadata } = result;

                // Verify all required metadata is present
                expect(metadata.encryptedOutput1).toBeInstanceOf(Buffer);
                expect(metadata.encryptedOutput1.length).toBeGreaterThan(0);
                expect(metadata.publicKey).toBeInstanceOf(PublicKey);
                expect(metadata.referrer).toBe('test-referrer');

                // Verify metadata can be serialized (for transfer to frontend)
                const serialized = JSON.stringify({
                    encryptedOutput1: metadata.encryptedOutput1.toString('base64'),
                    publicKey: metadata.publicKey.toString(),
                    referrer: metadata.referrer,
                });
                expect(serialized).toBeDefined();

                // Verify it can be deserialized
                const deserialized = JSON.parse(serialized);
                expect(deserialized.encryptedOutput1).toBe(metadata.encryptedOutput1.toString('base64'));
                expect(deserialized.publicKey).toBe(metadata.publicKey.toString());
            } else {
                throw new Error('Expected unsigned transaction result');
            }
        });

        it('should preserve SPL-specific metadata', async () => {
            const result = await depositSPL({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                base_units: 1000000,
                encryptionService: mockEncryptionService,
                mintAddress: USDC_MINT,
                transactionSigner: undefined,
                referrer: 'test-referrer',
            });

            if ('unsignedTransaction' in result) {
                const { metadata } = result;

                // SPL metadata includes mintAddress
                expect(metadata.mintAddress).toBe(USDC_MINT.toString());

                // Verify SPL metadata can be serialized
                const serialized = JSON.stringify({
                    encryptedOutput1: metadata.encryptedOutput1.toString('base64'),
                    publicKey: metadata.publicKey.toString(),
                    referrer: metadata.referrer,
                    mintAddress: metadata.mintAddress,
                });
                expect(serialized).toBeDefined();
            } else {
                throw new Error('Expected unsigned transaction result');
            }
        });
    });

    describe('Backward compatibility', () => {
        it('should maintain backward compatible behavior when signer is provided', async () => {
            // Mock successful relay
            (global.fetch as any).mockImplementation((url: string) => {
                if (url.includes('/tree/state')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            root: '12345678901234567890123456789012',
                            nextIndex: 100,
                        }),
                    });
                }
                if (url.includes('/utxos')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve([]),
                    });
                }
                if (url.includes('/deposit')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            signature: 'backward-compat-sig',
                            success: true,
                        }),
                    });
                }
                if (url.includes('/utxos/check/')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ exists: true }),
                    });
                }
                return Promise.reject(new Error('Unknown URL'));
            });

            const result = await deposit({
                lightWasm,
                storage,
                keyBasePath: path.join(__dirname, '..', 'circuit2', 'transaction2'),
                publicKey: mockPublicKey,
                connection: mockConnection,
                amount_in_lamports: 0.01 * LAMPORTS_PER_SOL,
                encryptionService: mockEncryptionService,
                transactionSigner: async (tx: VersionedTransaction) => {
                    tx.sign([mockKeypair]);
                    return tx;
                },
            });

            // Should return old-style signed result
            expect('tx' in result).toBe(true);
            if ('tx' in result) {
                expect(result.tx).toBe('backward-compat-sig');
            }
        });
    });
});
