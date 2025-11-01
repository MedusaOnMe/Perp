import { getDb, Collections } from '../../config/firebase';
import { Timestamp } from 'firebase-admin/firestore';
import { User, PendingExport, KeyExport, ProcessedTweet } from '../models/user';
import { Order } from '../models/order';
import { Position } from '../models/position';
import { Deposit, PlatformWallet } from '../models/deposit';

export class DbService {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    this.db = getDb();
  }

  // ========== USER OPERATIONS ==========

  async getUserByHandle(twitterHandle: string): Promise<User | null> {
    const normalized = twitterHandle.toLowerCase().replace('@', '');
    const snapshot = await this.db
      .collection(Collections.USERS)
      .where('twitterHandle', '==', normalized)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as User;
  }

  async getUserById(userId: string): Promise<User | null> {
    const doc = await this.db.collection(Collections.USERS).doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as User;
  }

  async createUser(userData: Omit<User, 'id'>): Promise<User> {
    const docRef = await this.db.collection(Collections.USERS).add({
      ...userData,
      createdAt: Timestamp.now(),
      lastActivityAt: Timestamp.now()
    });

    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as User;
  }

  async updateUserBalance(userId: string, newBalance: number): Promise<void> {
    await this.db.collection(Collections.USERS).doc(userId).update({
      internalBalance: newBalance,
      lastActivityAt: Timestamp.now()
    });
  }

  async creditUserDeposit(userId: string, amount: number): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');

    await this.db.collection(Collections.USERS).doc(userId).update({
      internalBalance: user.internalBalance + amount,
      totalDeposits: user.totalDeposits + amount,
      lastActivityAt: Timestamp.now()
    });
  }

  // ========== PROCESSED TWEETS ==========

  async isProcessed(tweetId: string): Promise<boolean> {
    const doc = await this.db.collection(Collections.PROCESSED_TWEETS).doc(tweetId).get();
    return doc.exists;
  }

  async markProcessed(
    tweetId: string,
    userId: string,
    twitterHandle: string,
    command: string,
    result: 'success' | 'error',
    errorMessage?: string
  ): Promise<void> {
    await this.db.collection(Collections.PROCESSED_TWEETS).doc(tweetId).set({
      tweetId,
      userId,
      twitterHandle,
      command,
      processedAt: Timestamp.now(),
      result,
      errorMessage
    });
  }

  // ========== ORDERS ==========

  async saveOrder(orderData: Omit<Order, 'id'>): Promise<Order> {
    const docRef = await this.db.collection(Collections.ORDERS).add({
      ...orderData,
      createdAt: Timestamp.now()
    });

    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as Order;
  }

  async getOrderById(orderId: string): Promise<Order | null> {
    const doc = await this.db.collection(Collections.ORDERS).doc(orderId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as Order;
  }

  async getUserOrders(userId: string, limit = 50): Promise<Order[]> {
    const snapshot = await this.db
      .collection(Collections.ORDERS)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  }

  async updateOrderStatus(
    orderId: string,
    status: Order['status'],
    filledQuantity?: number,
    avgFillPrice?: number
  ): Promise<void> {
    const updateData: any = { status };
    if (filledQuantity !== undefined) updateData.filledQuantity = filledQuantity;
    if (avgFillPrice !== undefined) updateData.avgFillPrice = avgFillPrice;
    if (status === 'filled') updateData.executedAt = Timestamp.now();

    await this.db.collection(Collections.ORDERS).doc(orderId).update(updateData);
  }

  // ========== POSITIONS ==========

  async getPosition(userId: string, symbol: string): Promise<Position | null> {
    const positionId = `${userId}_${symbol}`;
    const doc = await this.db.collection(Collections.POSITIONS).doc(positionId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as Position;
  }

  async getUserPositions(userId: string): Promise<Position[]> {
    const snapshot = await this.db
      .collection(Collections.POSITIONS)
      .where('userId', '==', userId)
      .where('closedAt', '==', null)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Position));
  }

  async savePosition(positionData: Omit<Position, 'id'>): Promise<Position> {
    const positionId = `${positionData.userId}_${positionData.symbol}`;
    await this.db.collection(Collections.POSITIONS).doc(positionId).set({
      ...positionData,
      openedAt: Timestamp.now(),
      lastUpdatedAt: Timestamp.now()
    });

    const doc = await this.db.collection(Collections.POSITIONS).doc(positionId).get();
    return { id: doc.id, ...doc.data() } as Position;
  }

  async updatePosition(positionId: string, updateData: Partial<Position>): Promise<void> {
    await this.db.collection(Collections.POSITIONS).doc(positionId).update({
      ...updateData,
      lastUpdatedAt: Timestamp.now()
    });
  }

  async closePosition(positionId: string): Promise<void> {
    await this.db.collection(Collections.POSITIONS).doc(positionId).update({
      closedAt: Timestamp.now(),
      lastUpdatedAt: Timestamp.now()
    });
  }

  // ========== PENDING EXPORTS ==========

  async createPendingExport(exportData: Omit<PendingExport, 'id'>): Promise<PendingExport> {
    const docRef = await this.db.collection(Collections.PENDING_EXPORTS).add({
      ...exportData,
      createdAt: Timestamp.now()
    });

    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as PendingExport;
  }

  async getPendingExportByCode(code: string, twitterHandle: string): Promise<PendingExport | null> {
    const normalized = twitterHandle.toLowerCase().replace('@', '');
    const snapshot = await this.db
      .collection(Collections.PENDING_EXPORTS)
      .where('code', '==', code)
      .where('twitterHandle', '==', normalized)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as PendingExport;
  }

  async getPendingExportBySecretPath(secretPath: string): Promise<PendingExport | null> {
    const snapshot = await this.db
      .collection(Collections.PENDING_EXPORTS)
      .where('secretPath', '==', secretPath)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as PendingExport;
  }

  async updatePendingExportStatus(exportId: string, status: PendingExport['status']): Promise<void> {
    await this.db.collection(Collections.PENDING_EXPORTS).doc(exportId).update({ status });
  }

  // ========== KEY EXPORTS ==========

  async createKeyExport(secretPath: string, privateKey: string, ttlSeconds = 30): Promise<void> {
    const now = Timestamp.now();
    const expiresAt = new Timestamp(now.seconds + ttlSeconds, now.nanoseconds);

    await this.db.collection(Collections.KEY_EXPORTS).doc(secretPath).set({
      privateKey,
      createdAt: now,
      expiresAt,
      accessed: false
    });
  }

  async getKeyExport(secretPath: string): Promise<KeyExport | null> {
    const doc = await this.db.collection(Collections.KEY_EXPORTS).doc(secretPath).get();
    if (!doc.exists) return null;

    const data = doc.data() as Omit<KeyExport, 'id'>;

    // Check if expired
    if (data.expiresAt.toMillis() < Date.now()) {
      await this.deleteKeyExport(secretPath);
      return null;
    }

    return { id: doc.id, ...data };
  }

  async markKeyExportAccessed(secretPath: string): Promise<void> {
    await this.db.collection(Collections.KEY_EXPORTS).doc(secretPath).update({
      accessed: true
    });
  }

  async deleteKeyExport(secretPath: string): Promise<void> {
    await this.db.collection(Collections.KEY_EXPORTS).doc(secretPath).delete();
  }

  // ========== UTILITY ==========

  async getTodayVolume(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    const snapshot = await this.db
      .collection(Collections.ORDERS)
      .where('userId', '==', userId)
      .where('createdAt', '>=', todayTimestamp)
      .where('status', '==', 'filled')
      .get();

    let totalVolume = 0;
    snapshot.docs.forEach(doc => {
      const order = doc.data() as Order;
      totalVolume += order.quantity * (order.avgFillPrice || 0);
    });

    return totalVolume;
  }

  // ========== DEPOSITS ==========

  async createDeposit(depositData: Omit<Deposit, 'id'>): Promise<Deposit> {
    const docRef = await this.db.collection(Collections.DEPOSITS).add({
      ...depositData,
      detectedAt: Timestamp.now()
    });

    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as Deposit;
  }

  async getDepositByTxHash(txHash: string): Promise<Deposit | null> {
    const snapshot = await this.db
      .collection(Collections.DEPOSITS)
      .where('txHash', '==', txHash)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Deposit;
  }

  async getDepositById(depositId: string): Promise<Deposit | null> {
    const doc = await this.db.collection(Collections.DEPOSITS).doc(depositId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as Deposit;
  }

  async getUserDeposits(userId: string, limit = 50): Promise<Deposit[]> {
    const snapshot = await this.db
      .collection(Collections.DEPOSITS)
      .where('userId', '==', userId)
      .orderBy('detectedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deposit));
  }

  async getPendingDeposits(): Promise<Deposit[]> {
    const snapshot = await this.db
      .collection(Collections.DEPOSITS)
      .where('status', 'in', ['pending', 'confirmed'])
      .where('orderlyConfirmed', '==', false)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deposit));
  }

  async updateDepositStatus(
    depositId: string,
    status: Deposit['status'],
    updateData?: Partial<Deposit>
  ): Promise<void> {
    const data: any = { status, ...updateData };

    if (status === 'confirmed') {
      data.confirmedAt = Timestamp.now();
    } else if (status === 'credited') {
      data.creditedAt = Timestamp.now();
    }

    await this.db.collection(Collections.DEPOSITS).doc(depositId).update(data);
  }

  // ========== PLATFORM WALLET ==========

  async getPlatformWallet(): Promise<PlatformWallet | null> {
    const snapshot = await this.db
      .collection(Collections.PLATFORM_WALLETS)
      .where('network', '==', 'arbitrum')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as PlatformWallet;
  }

  async createPlatformWallet(walletData: Omit<PlatformWallet, 'id'>): Promise<PlatformWallet> {
    const docRef = await this.db.collection(Collections.PLATFORM_WALLETS).add({
      ...walletData,
      createdAt: Timestamp.now()
    });

    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as PlatformWallet;
  }

  async updatePlatformWalletBlock(walletId: string, blockNumber: number): Promise<void> {
    await this.db.collection(Collections.PLATFORM_WALLETS).doc(walletId).update({
      lastScannedBlock: blockNumber
    });
  }
}

// Singleton instance
export const dbService = new DbService();
