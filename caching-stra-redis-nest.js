// Redis service wrapper 
import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly DEFAULT_TTL = 300 // 5 min
    private readonly KEY_PREFIX = 'myapp:';

    constructor(
        @Inject(CACHE_MANAGER) private cacheManager : Cache;
        private configService : ConfigService;
    ){}

    // Basic Operation
    async get<T>(key : string) : Promise<T | null> {
        const fullKey = this.getFullKey(key);

        return this.cacheManager.get<T>(fullKey);
    }

    async set(
        key : String,
        value : any,
        ttl ? : number,
    ){
        const fullKey = this.getFullKey(key);
        await this.cacheManager.set(fullKeym value, ttl || this.DEFAULT_TTL)
    }

    async del(key : string) {
        const fullKey = this.getFullKey(key);
        await this.cacheManager.del(fullKey);
    }

    async exists(key : string) {
        const fullKey = this.getFullKey(key);
        const value  = await this.cacheManager.get(fullKey);

        return value !== undefined;
    }

    // Helper 
    private getFullKey(key : string) {
        return `${this.KEY_PREFIX}{key}`
    }
}