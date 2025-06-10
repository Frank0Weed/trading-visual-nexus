
interface MessageBuffer {
  [key: string]: any[];
}

class WebSocketOptimizer {
  private messageBuffer: MessageBuffer = {};
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 16; // ~60fps
  private readonly MAX_BATCH_SIZE = 100;

  // Batch multiple messages for processing
  batchMessages<T>(
    messageType: string,
    message: T,
    processor: (messages: T[]) => void
  ): void {
    if (!this.messageBuffer[messageType]) {
      this.messageBuffer[messageType] = [];
    }

    this.messageBuffer[messageType].push(message);

    // Process immediately if batch is full
    if (this.messageBuffer[messageType].length >= this.MAX_BATCH_SIZE) {
      this.processBatch(messageType, processor);
      return;
    }

    // Schedule batch processing
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.processAllBatches();
      }, this.BATCH_DELAY);
    }
  }

  private processBatch<T>(messageType: string, processor: (messages: T[]) => void): void {
    const messages = this.messageBuffer[messageType] || [];
    if (messages.length > 0) {
      processor(messages);
      this.messageBuffer[messageType] = [];
    }
  }

  private processAllBatches(): void {
    // Process batches for all message types
    Object.keys(this.messageBuffer).forEach(messageType => {
      const messages = this.messageBuffer[messageType];
      if (messages.length > 0) {
        // Emit event for each message type
        this.emitBatchedMessages(messageType, messages);
        this.messageBuffer[messageType] = [];
      }
    });

    this.batchTimeout = null;
  }

  private emitBatchedMessages(messageType: string, messages: any[]): void {
    // Custom event emission for batched messages
    const event = new CustomEvent(`ws-batch-${messageType}`, {
      detail: { messages }
    });
    window.dispatchEvent(event);
  }

  // Debounce function for price updates
  debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }

  // Memory-efficient message deduplication
  deduplicateMessages<T extends { symbol?: string; time?: number }>(
    messages: T[]
  ): T[] {
    const seen = new Set<string>();
    return messages.filter(msg => {
      const key = `${msg.symbol || 'unknown'}-${msg.time || Date.now()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  cleanup(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.messageBuffer = {};
  }
}

export const wsOptimizer = new WebSocketOptimizer();
