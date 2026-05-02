/*

excellent candidates for caching
- User profiles
- product categlog
- configuration settings
- aggregation results
- session data
- api response

poor candidates for caching
- real time stock prices
- live chat messages (write heavy)
- temporary data (expires quickly)
- large files (> 10MB)
- Personalized data per user ( cache fragmentation )
*/

// -- redis module setup and configuration
@module({
    imports: [
        ConfigModule.forRoot({
            isGlobal : true,
            envFilePath : '.env',
        }),
        // global cache module with redis
        CacheModule.registerAsync({
            isGlobal : true,
            imports : [ConfigModule],
            useFactory : async (configService :ConfigService ) => {
                store : redisStore,

                // redis connection
                host: configService.get('REDIS_HOST', 'localhost'),
                port : configService.get('REDIS_PORT', 6379),
                password : configService.get('REDIS_PASSWORD'),
                db : configService.get('REDIS_DB', 0),
                
                // connection pooling
                max: 10, 
                ttl : 30000, // 5 minute
                prefix : 'myapp:' , // namespace

                retryStrategy : (times : number) => {
                    if(times > 3) {
                        console.error('Redis connection failed after 3 retries')
                        return null;
                    }
                    return Math.min(times * 50, 2000);
                }
            }
        }),
        inject : [ConfigService],

    ]
})

// .env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly DEFAULT_TTL = 300; // 5 minute
    private readonly KEY_PREFIX = 'myapp';

    constructor(
        @Inject(CACHE_MANAGER) private cacheManager : Cache,
        private configService : ConfigService,
    ){}

    // basic operation
    async get<t>(key : string) : Promise<T | null> {
        const fullKey =  this.getFullKey(key);
        return this.cacheManager.get<T>(fullKey);
    }

    async set(
        key : string,
        value : any,
        ttl ?: number,
    ): Promise<void> {
        const fullKey = this.getFullKey(key);
        await this.cacheManager.set(fullKey, value, ttl || this.DEFAULT_TTL)
    }

    async del(key: string) : Promise<void> { 
        const fullKey = this.getFullKey(key);

        await this.cacheManager.del(fullKey);
    }

    async exists(key: string): Promise<boolean> {
        const fullKey = this.getFullKey(key);
        const value = await this.cacheManager.get(fullKey);

        return value !== undefined;
    }

    // bulk operations
    async mget<T>(keys: string[]) : Promise<(T | null)[]>{
        const fullKeys = keys.map(k => this.getFullKey(k));

        return this.cacheManager.mget<t>(...fullKeys);
    }

    async mset(entries : Array<{ key: string; value:any; ttl? : number}>)
    : Promise<void>
    {
        const promises = entries.map(entry => 
            this.set(entry.key, entry.value, entry.ttl)
        )

        await Promise.all(promises);
    }

    async mdel(keys: string[]) : Promise<void> {
        const promises = keys.map(k => this.del(k))

        await Promise.all(promises);
    }

    // -- tag based invalidation
    async addToTag(key: string, tag : string) : Promise<void> {
        const tagKey = `tag:${tag}`;
        const members = await this.cacheManager.get<string[]>(tagKey) || []
        
        if(!members.includes(key)) {
            
        }
    }
}