import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { PrivacyCash } from "../src/index";
import { USDC_MINT } from "../src/utils/constants";

// Mock fetch globally
global.fetch = vi.fn();

describe('PrivacyCash Class - Unsigned Transaction Support', () => {
    let privacyCash: PrivacyCash;
    let mockKeypair: Keypair;
    let mockRpcUrl: string;

    beforeAll(() => {
        mockRpcUrl = 'https://mock-rpc-url.com';
    });

    beforeEach(() => {
        mockKeypair = Keypair.generate();

        privacyCash = new PrivacyCash({
            RPC_url: mockRpcUrl,
            owner: mockKeypair,
            enableDebug: true,
        });

        // Mock all API calls
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
            if (url.includes('/proof/')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        pathElements: Array(20).fill('0'),
                        pathIndices: Array(20).fill(0),
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
                        signature: 'mock-deposit-signature',
                        success: true,
                    }),
                });
            }
            if (url.includes('/deposit/spl')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        signature: 'mock-spl-deposit-signature',
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
            return Promise.reject(new Error('Unknown URL: ' + url));
        });

        // Mock Connection methods
        vi.spyOn(privacyCash['connection'], 'getBalance').mockResolvedValue(10 * LAMPORTS_PER_SOL);
        vi.spyOn(privacyCash['connection'], 'getAccountInfo').mockResolvedValue({
            data: Buffer.alloc(4129),
            executable: false,
            lamports: 0,
            owner: PublicKey.default,
            rentEpoch: 0,
        });
        vi.spyOn(privacyCash['connection'], 'getLatestBlockhash').mockResolvedValue({
            blockhash: 'mock-blockhash',
            lastValidBlockHeight: 1000000,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('deposit() with returnUnsigned parameter', () => {
        it('should return unsigned transaction when returnUnsigned is true', async () => {
            const result = await privacyCash.deposit({
                lamports: 0.01 * LAMPORTS_PER_SOL,
                returnUnsigned: true,
            });

            expect('unsignedTransaction' in result).toBe(true);
            if ('unsignedTransaction' in result) {
                expect(result.unsignedTransaction).toBeInstanceOf(VersionedTransaction);
                expect(result.metadata).toBeDefined();
                expect(result.metadata.publicKey.toString()).toBe(privacyCash.publicKey.toString());
            }
        });

        it('should return signed transaction when returnUnsigned is false', async () => {
            const result = await privacyCash.deposit({
                lamports: 0.01 * LAMPORTS_PER_SOL,
                returnUnsigned: false,
            });

            expect('tx' in result).toBe(true);
            if ('tx' in result) {
                expect(result.tx).toBe('mock-deposit-signature');
            }
        });

        it('should return signed transaction when returnUnsigned is undefined (default behavior)', async () => {
            const result = await privacyCash.deposit({
                lamports: 0.01 * LAMPORTS_PER_SOL,
            });

            expect('tx' in result).toBe(true);
            if ('tx' in result) {
                expect(result.tx).toBe('mock-deposit-signature');
            }
        });
    });

    describe('depositUSDC() with returnUnsigned parameter', () => {
        beforeEach(() => {
            // Mock SPL token account
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

        it('should return unsigned transaction when returnUnsigned is true', async () => {
            const result = await privacyCash.depositUSDC({
                base_units: 1000000, // 1 USDC
                returnUnsigned: true,
            });

            expect('unsignedTransaction' in result).toBe(true);
            if ('unsignedTransaction' in result) {
                expect(result.unsignedTransaction).toBeInstanceOf(VersionedTransaction);
                expect(result.metadata.mintAddress).toBe(USDC_MINT.toString());
            }
        });

        it('should return signed transaction when returnUnsigned is false', async () => {
            const result = await privacyCash.depositUSDC({
                base_units: 1000000,
                returnUnsigned: false,
            });

            expect('tx' in result).toBe(true);
            if ('tx' in result) {
                expect(result.tx).toBe('mock-spl-deposit-signature');
            }
        });
    });

    describe('depositSPL() with returnUnsigned parameter', () => {
        beforeEach(() => {
            vi.mock('@solana/spl-token', async () => {
                const actual = await vi.importActual('@solana/spl-token');
                return {
                    ...actual,
                    getAccount: vi.fn().mockResolvedValue({
                        amount: BigInt(1000000000),
                    }),
                    getMint: vi.fn().mockResolvedValue({
                        decimals: 6,
                    }),
                };
            });
        });

        it('should return unsigned transaction when returnUnsigned is true', async () => {
            const result = await privacyCash.depositSPL({
                base_units: 1000000,
                mintAddress: USDC_MINT,
                returnUnsigned: true,
            });

            expect('unsignedTransaction' in result).toBe(true);
            if ('unsignedTransaction' in result) {
                expect(result.unsignedTransaction).toBeInstanceOf(VersionedTransaction);
                expect(result.metadata.mintAddress).toBe(USDC_MINT.toString());
            }
        });

        it('should return signed transaction when returnUnsigned is false', async () => {
            const result = await privacyCash.depositSPL({
                base_units: 1000000,
                mintAddress: USDC_MINT,
                returnUnsigned: false,
            });

            expect('tx' in result).toBe(true);
        });
    });

    describe('submitSignedDeposit()', () => {
        it('should successfully submit a signed SOL deposit transaction', async () => {
            // First get an unsigned transaction
            const unsignedResult = await privacyCash.deposit({
                lamports: 0.01 * LAMPORTS_PER_SOL,
                returnUnsigned: true,
            });

            if ('unsignedTransaction' in unsignedResult) {
                const { unsignedTransaction, metadata } = unsignedResult;

                // Sign the transaction
                unsignedTransaction.sign([mockKeypair]);

                // Submit the signed transaction
                const result = await privacyCash.submitSignedDeposit(unsignedTransaction, metadata);

                expect(result.tx).toBe('mock-deposit-signature');
            } else {
                throw new Error('Expected unsigned transaction');
            }
        });

        it('should properly relay transaction to indexer with correct parameters', async () => {
            const fetchSpy = vi.spyOn(global, 'fetch');

            const unsignedResult = await privacyCash.deposit({
                lamports: 0.01 * LAMPORTS_PER_SOL,
                returnUnsigned: true,
            });

            if ('unsignedTransaction' in unsignedResult) {
                const { unsignedTransaction, metadata } = unsignedResult;
                unsignedTransaction.sign([mockKeypair]);

                await privacyCash.submitSignedDeposit(unsignedTransaction, metadata);

                // Verify the deposit endpoint was called
                const depositCalls = fetchSpy.mock.calls.filter(call =>
                    call[0]?.toString().includes('/deposit') &&
                    !call[0]?.toString().includes('/deposit/spl')
                );
                expect(depositCalls.length).toBeGreaterThan(0);

                // Verify the request body contains the signed transaction
                const lastDepositCall = depositCalls[depositCalls.length - 1];
                if (lastDepositCall[1]?.body) {
                    const body = JSON.parse(lastDepositCall[1].body as string);
                    expect(body.signedTransaction).toBeDefined();
                    expect(body.senderAddress).toBe(metadata.publicKey.toString());
                }
            }
        });

        it('should include referrer when provided in metadata', async () => {
            const fetchSpy = vi.spyOn(global, 'fetch');
            const referrer = 'test-referrer-address';

            // Mock deposit with referrer
            const unsignedResult = await privacyCash.deposit({
                lamports: 0.01 * LAMPORTS_PER_SOL,
                returnUnsigned: true,
            });

            if ('unsignedTransaction' in unsignedResult) {
                // Manually add referrer to metadata for testing
                const metadata = { ...unsignedResult.metadata, referrer };
                unsignedResult.unsignedTransaction.sign([mockKeypair]);

                await privacyCash.submitSignedDeposit(unsignedResult.unsignedTransaction, metadata);

                const depositCalls = fetchSpy.mock.calls.filter(call =>
                    call[0]?.toString().includes('/deposit') &&
                    !call[0]?.toString().includes('/deposit/spl')
                );
                const lastDepositCall = depositCalls[depositCalls.length - 1];

                if (lastDepositCall[1]?.body) {
                    const body = JSON.parse(lastDepositCall[1].body as string);
                    expect(body.referralWalletAddress).toBe(referrer);
                }
            }
        });

        it('should wait for transaction confirmation', async () => {
            let checkCallCount = 0;
            (global.fetch as any).mockImplementation((url: string) => {
                if (url.includes('/utxos/check/')) {
                    checkCallCount++;
                    // Return exists: true on second call
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ exists: checkCallCount >= 2 }),
                    });
                }
                if (url.includes('/deposit')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            signature: 'confirmed-signature',
                            success: true,
                        }),
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({}),
                });
            });

            const unsignedResult = await privacyCash.deposit({
                lamports: 0.01 * LAMPORTS_PER_SOL,
                returnUnsigned: true,
            });

            if ('unsignedTransaction' in unsignedResult) {
                unsignedResult.unsignedTransaction.sign([mockKeypair]);
                const result = await privacyCash.submitSignedDeposit(
                    unsignedResult.unsignedTransaction,
                    unsignedResult.metadata
                );

                expect(result.tx).toBe('confirmed-signature');
                expect(checkCallCount).toBeGreaterThanOrEqual(2);
            }
        });

        it('should throw error when relay fails', async () => {
            (global.fetch as any).mockImplementation((url: string) => {
                if (url.includes('/deposit')) {
                    return Promise.resolve({
                        ok: false,
                        text: () => Promise.resolve('Relay failed'),
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({}),
                });
            });

            const unsignedResult = await privacyCash.deposit({
                lamports: 0.01 * LAMPORTS_PER_SOL,
                returnUnsigned: true,
            });

            if ('unsignedTransaction' in unsignedResult) {
                unsignedResult.unsignedTransaction.sign([mockKeypair]);

                await expect(
                    privacyCash.submitSignedDeposit(unsignedResult.unsignedTransaction, unsignedResult.metadata)
                ).rejects.toThrow('response not ok');
            }
        });
    });

    describe('submitSignedDepositSPL()', () => {
        beforeEach(() => {
            vi.mock('@solana/spl-token', async () => {
                const actual = await vi.importActual('@solana/spl-token');
                return {
                    ...actual,
                    getAccount: vi.fn().mockResolvedValue({
                        amount: BigInt(1000000000),
                    }),
                };
            });
        });

        it('should successfully submit a signed SPL deposit transaction', async () => {
            const unsignedResult = await privacyCash.depositSPL({
                base_units: 1000000,
                mintAddress: USDC_MINT,
                returnUnsigned: true,
            });

            if ('unsignedTransaction' in unsignedResult) {
                const { unsignedTransaction, metadata } = unsignedResult;
                unsignedTransaction.sign([mockKeypair]);

                const result = await privacyCash.submitSignedDepositSPL(unsignedTransaction, metadata);

                expect(result.tx).toBe('mock-spl-deposit-signature');
            } else {
                throw new Error('Expected unsigned transaction');
            }
        });

        it('should include mintAddress in the relay request', async () => {
            const fetchSpy = vi.spyOn(global, 'fetch');

            const unsignedResult = await privacyCash.depositSPL({
                base_units: 1000000,
                mintAddress: USDC_MINT,
                returnUnsigned: true,
            });

            if ('unsignedTransaction' in unsignedResult) {
                unsignedResult.unsignedTransaction.sign([mockKeypair]);
                await privacyCash.submitSignedDepositSPL(unsignedResult.unsignedTransaction, unsignedResult.metadata);

                const depositSplCalls = fetchSpy.mock.calls.filter(call =>
                    call[0]?.toString().includes('/deposit/spl')
                );
                expect(depositSplCalls.length).toBeGreaterThan(0);

                const lastCall = depositSplCalls[depositSplCalls.length - 1];
                if (lastCall[1]?.body) {
                    const body = JSON.parse(lastCall[1].body as string);
                    expect(body.mintAddress).toBe(USDC_MINT.toString());
                }
            }
        });

        it('should use correct token name for confirmation check', async () => {
            const fetchSpy = vi.spyOn(global, 'fetch');

            const unsignedResult = await privacyCash.depositSPL({
                base_units: 1000000,
                mintAddress: USDC_MINT,
                returnUnsigned: true,
            });

            if ('unsignedTransaction' in unsignedResult) {
                unsignedResult.unsignedTransaction.sign([mockKeypair]);
                await privacyCash.submitSignedDepositSPL(unsignedResult.unsignedTransaction, unsignedResult.metadata);

                // Check that utxos/check endpoint was called with token parameter
                const checkCalls = fetchSpy.mock.calls.filter(call =>
                    call[0]?.toString().includes('/utxos/check/') &&
                    call[0]?.toString().includes('token=')
                );
                expect(checkCalls.length).toBeGreaterThan(0);
            }
        });
    });

    describe('Full workflow integration', () => {
        it('should support complete backend-frontend-backend flow for SOL', async () => {
            // Step 1: Backend generates unsigned transaction
            const unsignedResult = await privacyCash.deposit({
                lamports: 0.01 * LAMPORTS_PER_SOL,
                returnUnsigned: true,
            });

            expect('unsignedTransaction' in unsignedResult).toBe(true);

            if ('unsignedTransaction' in unsignedResult) {
                const { unsignedTransaction, metadata } = unsignedResult;

                // Step 2: Serialize for transfer to frontend (simulation)
                const serializedTx = Buffer.from(unsignedTransaction.serialize()).toString('base64');
                const serializedMetadata = {
                    encryptedOutput1: metadata.encryptedOutput1.toString('base64'),
                    publicKey: metadata.publicKey.toString(),
                    referrer: metadata.referrer,
                };

                expect(serializedTx).toBeDefined();
                expect(serializedMetadata).toBeDefined();

                // Step 3: Frontend signs (simulated)
                const deserializedTx = VersionedTransaction.deserialize(Buffer.from(serializedTx, 'base64'));
                deserializedTx.sign([mockKeypair]);

                // Step 4: Backend submits signed transaction
                const deserializedMetadata = {
                    encryptedOutput1: Buffer.from(serializedMetadata.encryptedOutput1, 'base64'),
                    publicKey: new PublicKey(serializedMetadata.publicKey),
                    referrer: serializedMetadata.referrer,
                };

                const result = await privacyCash.submitSignedDeposit(deserializedTx, deserializedMetadata);

                expect(result.tx).toBe('mock-deposit-signature');
            }
        });

        it('should support complete backend-frontend-backend flow for SPL', async () => {
            const unsignedResult = await privacyCash.depositUSDC({
                base_units: 1000000,
                returnUnsigned: true,
            });

            expect('unsignedTransaction' in unsignedResult).toBe(true);

            if ('unsignedTransaction' in unsignedResult) {
                const { unsignedTransaction, metadata } = unsignedResult;

                // Serialize for transfer
                const serializedTx = Buffer.from(unsignedTransaction.serialize()).toString('base64');
                const serializedMetadata = {
                    encryptedOutput1: metadata.encryptedOutput1.toString('base64'),
                    publicKey: metadata.publicKey.toString(),
                    referrer: metadata.referrer,
                    mintAddress: metadata.mintAddress,
                };

                // Frontend signs
                const deserializedTx = VersionedTransaction.deserialize(Buffer.from(serializedTx, 'base64'));
                deserializedTx.sign([mockKeypair]);

                // Backend submits
                const deserializedMetadata = {
                    encryptedOutput1: Buffer.from(serializedMetadata.encryptedOutput1, 'base64'),
                    publicKey: new PublicKey(serializedMetadata.publicKey),
                    referrer: serializedMetadata.referrer,
                    mintAddress: serializedMetadata.mintAddress,
                };

                const result = await privacyCash.submitSignedDepositSPL(deserializedTx, deserializedMetadata);

                expect(result.tx).toBe('mock-spl-deposit-signature');
            }
        });
    });
});
