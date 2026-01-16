import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { deposit, type UnsignedDepositResult, type SignedDepositResult } from './deposit.js';
import { getBalanceFromUtxos, getUtxos, localstorageKey } from './getUtxos.js';
import { getBalanceFromUtxosSPL, getUtxosSPL } from './getUtxosSPL.js';

import { LSK_ENCRYPTED_OUTPUTS, LSK_FETCH_OFFSET, SplList, TokenList, tokens, USDC_MINT, RELAYER_API_URL } from './utils/constants.js';
import { logger, type LoggerFn, setLogger } from './utils/logger.js';
import { EncryptionService } from './utils/encryption.js';
import { WasmFactory } from '@lightprotocol/hasher.rs';
import bs58 from 'bs58'
import { withdraw } from './withdraw.js';
import { LocalStorage } from "node-localstorage";
import path from 'node:path'
import { depositSPL, type UnsignedDepositSPLResult, type SignedDepositSPLResult } from './depositSPL.js';
import { withdrawSPL } from './withdrawSPL.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { Buffer } from 'buffer';

let storage = new LocalStorage(path.join(process.cwd(), "cache"));

// Export types for external use
export type { UnsignedDepositResult, SignedDepositResult } from './deposit.js';
export type { UnsignedDepositSPLResult, SignedDepositSPLResult } from './depositSPL.js';

export class PrivacyCash {
    private connection: Connection
    public publicKey: PublicKey
    private encryptionService: EncryptionService
    private keypair: Keypair
    private isRuning?: boolean = false
    private status: string = ''
    constructor({ RPC_url, owner, enableDebug }: {
        RPC_url: string,
        owner: string | number[] | Uint8Array | Keypair,
        enableDebug?: boolean
    }) {
        let keypair = getSolanaKeypair(owner)
        if (!keypair) {
            throw new Error('param "owner" is not a valid Private Key or Keypair')
        }
        this.keypair = keypair
        this.connection = new Connection(RPC_url, 'confirmed')
        this.publicKey = keypair.publicKey
        this.encryptionService = new EncryptionService();
        this.encryptionService.deriveEncryptionKeyFromWallet(this.keypair);
        if (!enableDebug) {
            this.startStatusRender()
            this.setLogger((level, message) => {
                if (level == 'info') {
                    this.status = message
                } else if (level == 'error') {
                    console.log('error message: ', message)
                }
            })
        }
    }

    setLogger(loger: LoggerFn) {
        setLogger(loger)
        return this
    }

    /**
     * Clears the cache of utxos.
     * 
     * By default, downloaded utxos will be cached in the local storage. Thus the next time when you makes another
     * deposit or withdraw or getPrivateBalance, the SDK only fetches the utxos that are not in the cache.
     * 
     * This method clears the cache of utxos.
     */
    async clearCache() {
        if (!this.publicKey) {
            return this
        }
        storage.removeItem(LSK_FETCH_OFFSET + localstorageKey(this.publicKey))
        storage.removeItem(LSK_ENCRYPTED_OUTPUTS + localstorageKey(this.publicKey))
        // spl
        for (let token of tokens) {
            let ata = await getAssociatedTokenAddress(
                token.pubkey,
                this.publicKey
            );
            storage.removeItem(LSK_FETCH_OFFSET + localstorageKey(ata))
            storage.removeItem(LSK_ENCRYPTED_OUTPUTS + localstorageKey(ata))
        }
        return this
    }

    /**
     * Deposit SOL to the Privacy Cash.
     *
     * Lamports is the amount of SOL in lamports. e.g. if you want to deposit 0.01 SOL (10000000 lamports), call deposit({ lamports: 10000000 })
     *
     * @param returnUnsigned - If true, returns an unsigned transaction that can be signed externally. If false or undefined, signs and submits the transaction automatically.
     */
    async deposit({ lamports, returnUnsigned }: {
        lamports: number,
        returnUnsigned?: boolean
    }): Promise<UnsignedDepositResult | SignedDepositResult> {
        this.isRuning = true
        logger.info('start depositting')
        let lightWasm = await WasmFactory.getInstance()
        let res = await deposit({
            lightWasm,
            amount_in_lamports: lamports,
            connection: this.connection,
            encryptionService: this.encryptionService,
            publicKey: this.publicKey,
            transactionSigner: returnUnsigned ? undefined : async (tx: VersionedTransaction) => {
                tx.sign([this.keypair])
                return tx
            },
            keyBasePath: path.join(import.meta.dirname, '..', 'circuit2', 'transaction2'),
            storage
        })
        this.isRuning = false
        return res
    }

    /**
    * Deposit USDC to the Privacy Cash.
    *
    * @param returnUnsigned - If true, returns an unsigned transaction that can be signed externally. If false or undefined, signs and submits the transaction automatically.
    */
    async depositUSDC({ base_units, returnUnsigned }: {
        base_units: number,
        returnUnsigned?: boolean
    }): Promise<UnsignedDepositSPLResult | SignedDepositSPLResult> {
        this.isRuning = true
        logger.info('start depositting')
        let lightWasm = await WasmFactory.getInstance()
        let res = await depositSPL({
            mintAddress: USDC_MINT,
            lightWasm,
            base_units: base_units,
            connection: this.connection,
            encryptionService: this.encryptionService,
            publicKey: this.publicKey,
            transactionSigner: returnUnsigned ? undefined : async (tx: VersionedTransaction) => {
                tx.sign([this.keypair])
                return tx
            },
            keyBasePath: path.join(import.meta.dirname, '..', 'circuit2', 'transaction2'),
            storage
        })
        this.isRuning = false
        return res
    }

    /**
     * Withdraw SOL from the Privacy Cash.
     * 
     * Lamports is the amount of SOL in lamports. e.g. if you want to withdraw 0.01 SOL (10000000 lamports), call withdraw({ lamports: 10000000 })
     */
    async withdraw({ lamports, recipientAddress, referrer }: {
        lamports: number,
        recipientAddress?: string,
        referrer?: string
    }) {
        this.isRuning = true
        logger.info('start withdrawing')
        let lightWasm = await WasmFactory.getInstance()
        let recipient = recipientAddress ? new PublicKey(recipientAddress) : this.publicKey
        let res = await withdraw({
            lightWasm,
            amount_in_lamports: lamports,
            connection: this.connection,
            encryptionService: this.encryptionService,
            publicKey: this.publicKey,
            recipient,
            keyBasePath: path.join(import.meta.dirname, '..', 'circuit2', 'transaction2'),
            storage,
            referrer
        })
        logger.debug(`Withdraw successful. Recipient ${recipient} received ${res.amount_in_lamports / LAMPORTS_PER_SOL} SOL, with ${res.fee_in_lamports / LAMPORTS_PER_SOL} SOL relayers fees`)
        this.isRuning = false
        return res
    }

    /**
      * Withdraw USDC from the Privacy Cash.
      * 
      * base_units is the amount of USDC in base unit. e.g. if you want to withdraw 1 USDC (1,000,000 base unit), call withdraw({ base_units: 1000000, recipientAddress: 'some_address' })
      */
    async withdrawUSDC({ base_units, recipientAddress, referrer }: {
        base_units: number,
        recipientAddress?: string,
        referrer?: string
    }) {
        this.isRuning = true
        logger.info('start withdrawing')
        let lightWasm = await WasmFactory.getInstance()
        let recipient = recipientAddress ? new PublicKey(recipientAddress) : this.publicKey
        let res = await withdrawSPL({
            mintAddress: USDC_MINT,
            lightWasm,
            base_units,
            connection: this.connection,
            encryptionService: this.encryptionService,
            publicKey: this.publicKey,
            recipient,
            keyBasePath: path.join(import.meta.dirname, '..', 'circuit2', 'transaction2'),
            storage,
            referrer
        })
        logger.debug(`Withdraw successful. Recipient ${recipient} received ${base_units} USDC units`)
        this.isRuning = false
        return res
    }

    /**
     * Returns the amount of lamports current wallet has in Privacy Cash.
     */
    async getPrivateBalance(abortSignal?: AbortSignal) {
        logger.info('getting private balance')
        this.isRuning = true
        let utxos = await getUtxos({ publicKey: this.publicKey, connection: this.connection, encryptionService: this.encryptionService, storage, abortSignal })
        this.isRuning = false
        return getBalanceFromUtxos(utxos)
    }

    /**
    * Returns the amount of base unites current wallet has in Privacy Cash.
    */
    async getPrivateBalanceUSDC() {
        logger.info('getting private balance')
        this.isRuning = true
        let utxos = await getUtxosSPL({ publicKey: this.publicKey, connection: this.connection, encryptionService: this.encryptionService, storage, mintAddress: USDC_MINT })
        this.isRuning = false
        return getBalanceFromUtxosSPL(utxos)
    }

    /**
    * Returns the amount of base unites current wallet has in Privacy Cash.
    */
    async getPrivateBalanceSpl(mintAddress: PublicKey | string) {
        this.isRuning = true
        let utxos = await getUtxosSPL({
            publicKey: this.publicKey,
            connection: this.connection,
            encryptionService: this.encryptionService,
            storage,
            mintAddress
        })
        this.isRuning = false
        return getBalanceFromUtxosSPL(utxos)
    }

    /**
     * Returns true if the code is running in a browser.
     */
    isBrowser() {
        return typeof window !== "undefined"
    }

    async startStatusRender() {
        let frames = ['-', '\\', '|', '/'];
        let i = 0
        while (true) {
            if (this.isRuning) {
                let k = i % frames.length
                i++
                stdWrite(this.status, frames[k])
            }
            await new Promise(r => setTimeout(r, 250));
        }
    }

    /**
   * Deposit SPL to the Privacy Cash.
   *
   * @param returnUnsigned - If true, returns an unsigned transaction that can be signed externally. If false or undefined, signs and submits the transaction automatically.
   */
    async depositSPL({ base_units, mintAddress, amount, returnUnsigned }: {
        base_units?: number,
        amount?: number,
        mintAddress: PublicKey | string,
        returnUnsigned?: boolean
    }): Promise<UnsignedDepositSPLResult | SignedDepositSPLResult> {
        this.isRuning = true
        logger.info('start depositting')
        let lightWasm = await WasmFactory.getInstance()
        let res = await depositSPL({
            lightWasm,
            base_units,
            amount,
            connection: this.connection,
            encryptionService: this.encryptionService,
            publicKey: this.publicKey,
            transactionSigner: returnUnsigned ? undefined : async (tx: VersionedTransaction) => {
                tx.sign([this.keypair])
                return tx
            },
            keyBasePath: path.join(import.meta.dirname, '..', 'circuit2', 'transaction2'),
            storage,
            mintAddress
        })
        this.isRuning = false
        return res
    }

    /**
      * Withdraw SPL from the Privacy Cash.
      */
    async withdrawSPL({ base_units, mintAddress, recipientAddress, amount, referrer }: {
        base_units?: number,
        amount?: number,
        mintAddress: PublicKey | string,
        recipientAddress?: string,
        referrer?: string
    }) {
        this.isRuning = true
        logger.info('start withdrawing')
        let lightWasm = await WasmFactory.getInstance()
        let recipient = recipientAddress ? new PublicKey(recipientAddress) : this.publicKey

        let res = await withdrawSPL({
            lightWasm,
            base_units,
            amount,
            connection: this.connection,
            encryptionService: this.encryptionService,
            publicKey: this.publicKey,
            recipient,
            keyBasePath: path.join(import.meta.dirname, '..', 'circuit2', 'transaction2'),
            storage,
            mintAddress,
            referrer
        })
        logger.debug(`Withdraw successful. Recipient ${recipient} received ${base_units} USDC units`)
        this.isRuning = false
        return res
    }

    /**
     * Submit a signed SOL deposit transaction to the relayer.
     *
     * This method is used after obtaining an unsigned transaction from deposit() with returnUnsigned=true,
     * signing it externally (e.g., on the frontend), and then submitting it to the relayer.
     *
     * @param signedTransaction - The signed VersionedTransaction
     * @param metadata - Metadata returned from the unsigned deposit call
     */
    async submitSignedDeposit(
        signedTransaction: VersionedTransaction,
        metadata: UnsignedDepositResult['metadata']
    ): Promise<{ tx: string }> {
        this.isRuning = true
        logger.info('submitting signed deposit transaction to relayer...')

        const serializedTransaction = Buffer.from(signedTransaction.serialize()).toString('base64');

        const params: any = {
            signedTransaction: serializedTransaction,
            senderAddress: metadata.publicKey.toString()
        };

        if (metadata.referrer) {
            params.referralWalletAddress = metadata.referrer;
        }

        const response = await fetch(`${RELAYER_API_URL}/deposit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            logger.error('res text:', await response.text())
            throw new Error('response not ok')
        }

        const result = await response.json() as { signature: string, success: boolean };
        logger.debug('Pre-signed deposit transaction relayed successfully!');
        logger.debug('Transaction signature:', result.signature);

        logger.info('Waiting for transaction confirmation...')

        let retryTimes = 0
        let itv = 2
        const encryptedOutputStr = Buffer.from(metadata.encryptedOutput1).toString('hex')
        let start = Date.now()
        while (true) {
            logger.info('Confirming transaction..')
            logger.debug(`retryTimes: ${retryTimes}`)
            await new Promise(resolve => setTimeout(resolve, itv * 1000));
            logger.debug('Fetching updated tree state...');
            let res = await fetch(RELAYER_API_URL + '/utxos/check/' + encryptedOutputStr)
            let resJson = await res.json()
            if (resJson.exists) {
                logger.debug(`Top up successfully in ${((Date.now() - start) / 1000).toFixed(2)} seconds!`);
                this.isRuning = false
                return { tx: result.signature }
            }
            if (retryTimes >= 10) {
                this.isRuning = false
                throw new Error('Refresh the page to see latest balance.')
            }
            retryTimes++
        }
    }

    /**
     * Submit a signed SPL deposit transaction to the relayer.
     *
     * This method is used after obtaining an unsigned transaction from depositUSDC() or depositSPL() with returnUnsigned=true,
     * signing it externally (e.g., on the frontend), and then submitting it to the relayer.
     *
     * @param signedTransaction - The signed VersionedTransaction
     * @param metadata - Metadata returned from the unsigned deposit call
     */
    async submitSignedDepositSPL(
        signedTransaction: VersionedTransaction,
        metadata: UnsignedDepositSPLResult['metadata']
    ): Promise<{ tx: string }> {
        this.isRuning = true
        logger.info('submitting signed SPL deposit transaction to relayer...')

        const serializedTransaction = Buffer.from(signedTransaction.serialize()).toString('base64');

        const params: any = {
            signedTransaction: serializedTransaction,
            senderAddress: metadata.publicKey.toString(),
            mintAddress: metadata.mintAddress
        };

        if (metadata.referrer) {
            params.referralWalletAddress = metadata.referrer;
        }

        const response = await fetch(`${RELAYER_API_URL}/deposit/spl`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            logger.debug('res text:', await response.text())
            throw new Error('response not ok')
        }

        const result = await response.json() as { signature: string, success: boolean };
        logger.debug('Pre-signed SPL deposit transaction relayed successfully!');
        logger.debug('Transaction signature:', result.signature);

        logger.info('Waiting for transaction confirmation...')

        // Find the token to get its name for the confirmation check
        let token = tokens.find(t => t.pubkey.toString() === metadata.mintAddress);
        if (!token) {
            throw new Error('Token not found: ' + metadata.mintAddress);
        }

        let retryTimes = 0
        let itv = 2
        const encryptedOutputStr = Buffer.from(metadata.encryptedOutput1).toString('hex')
        let start = Date.now()
        while (true) {
            logger.info('Confirming transaction..')
            logger.debug(`retryTimes: ${retryTimes}`)
            await new Promise(resolve => setTimeout(resolve, itv * 1000));
            logger.debug('Fetching updated tree state...');
            let url = RELAYER_API_URL + '/utxos/check/' + encryptedOutputStr + '?token=' + token.name
            let res = await fetch(url)
            let resJson = await res.json()
            if (resJson.exists) {
                logger.debug(`Top up successfully in ${((Date.now() - start) / 1000).toFixed(2)} seconds!`);
                this.isRuning = false
                return { tx: result.signature }
            }
            if (retryTimes >= 10) {
                this.isRuning = false
                throw new Error('Refresh the page to see latest balance.')
            }
            retryTimes++
        }
    }


}

function getSolanaKeypair(
    secret: string | number[] | Uint8Array | Keypair
): Keypair | null {
    try {
        if (secret instanceof Keypair) {
            return secret;
        }

        let keyArray: Uint8Array;

        if (typeof secret === "string") {
            keyArray = bs58.decode(secret);
        } else if (secret instanceof Uint8Array) {
            keyArray = secret;
        } else {
            // number[]
            keyArray = Uint8Array.from(secret);
        }

        if (keyArray.length !== 32 && keyArray.length !== 64) {
            return null;
        }
        return Keypair.fromSecretKey(keyArray);
    } catch {
        return null;
    }
}

function stdWrite(status: string, frame: string) {
    let blue = "\x1b[34m";
    let reset = "\x1b[0m";
    process.stdout.write(`${frame}status: ${blue}${status}${reset}\r`);
}