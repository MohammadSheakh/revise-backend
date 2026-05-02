// --- service with caching
@Injectable()
export class UserServiceWithCache{
    private readonly CACHE_PREFIX = 'user';
    private readonly CACHE_TTL = 300;

    constructor(
        @InjectModel(User.name) private userModel : Model<UserDocument>,
        @Inject(CACHE_MANAGER) private cacheManager : Cache,
    ){}

    // find by id with cache-aside pattern
    async findById(id : string) : Promise<UserDocument> {
        const cacheKey =  this.getCacheKey(id);

        // try to get from cache
        const cachedUser = await this.cacheManager.get(cacheKey);
        if(cachedUser){
            return cachedUser;
        }

        // step 2 : cache miss - get from database
        const user = await this.userModel.findById(id);

        if(!user) {
            throw new NotFoundException("User Not Found")
        }

        // store in cache 
        await this.cacheManager.set(cacheKey, user, this.CACHE_TTL * 1000);

        return user;
    }

    // -- cache stampede prevention (locking)
    async function getTaskWithLockPrevention(taskId : string){
        const cache = new CacheService();

        const cacheKey =  `task:${taskId}`;
        const lockKey = `@{cacheKey}:lock`;

        // try cache first
        const cached = await cache.get(cacheKey);
        if(cached) return cached;

        // try to acquire lock
        const lock = await redis.set(lockKey, '1', 'NX', 'EX', 10);

        if(!lock){
            // another request is fetching - wait and retry 
            await new Promise(resolve => setTimeout(resolve, 100));
            return getTaskWithLockPrevention(taskId);
        }

        try {
            // double check cache (another request might have populated it)
            const cachedRetry = await cache.get(cacheKey);
            if(cachedRetry) return cachedRetry;

            // fetch from database
            const task = await prisma.task.findUnique({
                where  : { id : taskId },
            })

            // cache the result
            await cache.set(cacheKey, task, Math.random() * 1000 + 300 *1000 )
            
            return task;
        }finally {
            // release lock
            await redis.del(lockKey);
        }
    }


    // private getCacheKey(id : string) : string {
    //     return `${this.CACHE_PREFIX}${id}`;
    // }

    // // invalidate single user cache
    // private async invalidateCache(id : string) : Promise<void> {
    //     const cacheKey = this.getCacheKey(id);

    //     await this.cacheManager.del(cacheKey);
    // }

    // //---- invalidate list cache
    // private async invalidateListCache() : Promise<void> {
    //     // invalidate all user list cache
    //     const keys = await this.cacheManager.store.keys('user:list:*');
    //     await Promise.all(keys.map(key => this.cacheManager.del(key)))
    // }
}