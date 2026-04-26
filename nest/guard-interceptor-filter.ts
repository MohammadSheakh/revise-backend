// -- guard execution context

export class AuthGuard implements CanActivate{

    canActivate(
        context : ExecutionContext // -> rich context object
    ) : boolean | Promise<boolean> | Observable<boolean>{
        // 1. Get request object
        const request = context.switchToHttp().getRequest();

        //2. get route handler info
        const handler = context.getHandler();
        const classRef = context.getClass();

        // 3. get metadata ( from decorators )
        const roles = this.reflector.get<string[]>('roles', handler);

        // 4. make decision
        return this.validate(request, roles);
    }
}

// -- authentication guard

@Injectable()
export class AuthGuardV2 implements CanActivate{
    constructor(private jwtService : JwtService){}

    async canActivate(
        context : ExecutionContext,
    ): Promise<boolean> {
        // extract request
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);

        // check if token exist
        if(!token){
            throw new UnauthorizedException(
                'Access token not found. Please login first'
            )
        }

        // 3. verify token
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret : process.env.JWT_SECRET,
            });

            // 4. attach user to request
            request['user'] = payload;
            request['userId'] = payload.sub;
        }catch(error){
            throw new UnauthorizedException(
                'Invalid or expired token. Please login again.'
            )
        }

        // 5. allow request to proceed
        return true;
    }

    // helper : extract token from auth header
    private extractTokenFromHeader(request: any) : string | undefined {
        const [type, token] = request.headers.authorization?.split(" ")
        return type === 'Bearer' ? token : undefined;
    }
}

// usages in controller

@Controller
@UseGuards(AuthGuard)
export class TaskController {

    @Get()
    findAll(@Request req){
        return this.taskService.findAll(req.user.userId);
    }


    @Get(':id')
    findOne(@Param(':id' id: string)){
        return this.taskService.findById(id)
    }
}


//-------- Role based authorization guard

export const Roles = (...roles : string[]) => {
    return SetMetadata('roles', roles);
}

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector : Reflector){}

    canActivate(
        context : ExecutionContext,
    ) : boolean {
        // get required roles from decorator
        const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
            context.getHandler(),
            context.getClass(),
        ])

        // if no roles required, allow access
        if(!requiredRoles || requiredRoles.length == 0){
            return true;
        }

        // get user from request ( SET BY AUTHGUARD )
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if(!user) {
            throw new ForbiddenException('User not authenticated')
        }

        // 4. check if user has required role
        const hasRole = requiredRoles.some((role) => user.role === role);
        if(!hasRole){
            throw new ForbiddenException(
                `Access Denied. Required roles : ${requiredRoles.join(', ')}.`+   `your role : ${user.role}`,
            )
        }

        return true;
    }
}


// ---------- Guard Type 3 : Ownership Guard

@Injectable()
export class OwnershipGuard implements CanActivate {
    constructor(
        @InjectModel('Task') private taskModel : Model<any>
    ){}

    async canActivate(context : ExecutionContext) : Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId = request.user.userId;
        const taskId = request.params.id;

        // check if user owns this task
        const task = await this.taskModel.findById(taskId);

        if(!task){
            throw new NotFoundException(' Task not found')
        }

        // check ownership
        const isOwner = task.ownerUserId.toString() === userId;
        if(!isOwner) {
        throw new ForbiddenException(
            'you do not have permission to access this resource',
            )
        }
        
        return true
    }
}

//------ Use this Ownership guard into controller
@TaskController('tasks')
@UseGuards(AuthGuard)
export class TaskController {
    @Get(':id')
    @UseGuards(OwnershipGuard) // <- check ownership
    async getTask(@Param('id') id : string) {
        return this.taskService.findById(id);
    }
}

// -------------- Rate limit Guard


//------------- Apply guard at different level -> global level, controller level, route level


//================================================ Part 2 : Interceptors - The Transformers

/*
Interceptor ->
    1. Transform response data before sending
    2. Transform request data before handler
    3. Cache response
    4. log request and response
    5. measure execution time
    6. modify http status codes
    7. handle errors
*/

// ==========> Interceptor Anatomy

export class TransformInterceptor implements NestInterceptor {
    intercept (
        context : ExecutionContext,
        next : CallHandler, // call next handler
    ) : Observable<any> {
        
        // before handler execution 
        const request = context.switchToHttp().getRequest();
        console.log('Before request : ', request.method, request.url)

        // call handler and get response stream
        return next.handle().pipe(
            // after handler execution
            map((data) => {
                console.log('after response :', data)

                // transform response 
                return{
                    success : true,
                    data : data,
                    timestamp : new Date().toISOString(),
                }
            })
        )
    }
}

// Interceptor Type 1 : Response Transformation
export interface Response<T> {
    success : boolean;
    data : T,
    message ?: string,
    timestamp : string,
    path ?: string,
}

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
    
    intercept(
        context : ExecutionContext,
        next : CallHandler,
    ): Observable<Response<T>> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        return next.handle().pipe(

            map((data) => {
                // standard response format

                return {
                    success : true,
                    data : data,
                    message : this.getMessageByStatus(response.statusCode),
                    timestamp : new Date().toISOString(),
                    path : request.url,
                }
            })
            // handle response format

        )
    }

    //-- helper
    private getMessageByStatus(statusCode) : string {
        const messages : Record<number, string> = {
            200 : 'Request successful',
            201 : 'dsdsd"
        }

        return messages[statusCode] || 'OK';
    }
}

export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger('HTTP');

    intercept(
        context : ExecutionContext,
        next : CallHandler,
    ) : Observable<any>{
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        const {method, url, body, headers, user} = request;

        // before request
        const startTime = Date.now();

        this.logger.log(`-----------------`)

        // after response
        return next.handle().pipe(
            tap((data) => {
                const duration = Date.now() - startTime;
                const statusCode = response.statusCode;

                this.logger.log(`-----------------`);

                // log slow request
                if(duration > 1000) {
                    this.logger.warn(` slow request detecterd : .. method .. url .. duration ms`)
                }
            })
        )
    }
}

// ----- Caching interceptor
export class CacheIntercptor implements NestInterceptor {
    private cache = new Map<string,  { data : any ; timestamp : number }>();
    private readonly TTL = 300000; // 5 minute

    intercept (context : ExecutionContext, next : CallHandler) : Observable<any> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        // Only cache GET requests
        if(request.method !== 'GET'){
            return next.handle();
        }

        // Generate cache key
        const key = this.generateCacheKey(request);

        // Check Cache
        const cachedItem = this.cache.get(key);

        if(cachedItem && !this.isExpired(cachedItem.timestamp)){
            // cache hit
            response.header('X-Cache', "Hit");
            response.header("X-Cache-Age", Math.floor(Date.now() - cachedItem.timestamp) / 1000)

            return of (cachedItem.data);
        }

        // cache miss - execute handler
        response.header("X-Cache", "MISS");

        return next.handle().pipe(
            delay(0),
            tap((data) => {
                // store in cache
                this.cache.set(key, {
                    data,
                    timestamp : Date.now(),
                })
            })
        )
    }

    // helper ---- Generate cache key from request

    private generateCacheKey(request : any) : string {
        const { url, query } = request;
        const queryString = JSON.stringify(query);
        return `cache:${url}:${queryString}`
    }

    // helper -- check if cache entry is expired 
    private isExpired(timestamp : number) : boolean{
        return Date.now() - timestamp > this.TTL
    }
}

// =========== 4.  Timeout interceptor


// ============ 5. Error Mapping Interceptor
 ===================== eta check dite hobe


//==================================== Exception Filters 
/*
    1. catch all unhandled exception
    2. format error responses consistently
    3. log errors for debugging
    4. transform technical errors to user-friendly messages
    5. handle specific error types differently
*/

//--- Exception Filter Anatomy

@Catch() // <- Catch all exception
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger =  new Logger('Exceptions');

    catch(exception : unknown , host : ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        // determine status code
        const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

        // determine error message
        const message = exception instanceof HttpException ? exception.message : 'Internal server error';

        // log error
        this.logger.error(
            `${request.method} ${request.url}`,
            exception instanceof Error ? exception.stack : '',
        )

        // send formatted response
        response.status(status).json({
            success : false,
            statusCode : status,
            message : message, 
            timestamp : new Date().toISOString(),
            path : request.url,
        })
    }
}


// Advance Exception Filter with error codes
export enum ErrorCode {
    // Authentication Errors (1000-1999)
    INVALID_TOKEN = 'AUTH_1001',
    TOKEN_EXPIRED = 'AUTH_1002',
    INVALID_CREDENTIALS = 'AUTH_1003',
    
    // Authorization Errors (2000-2999)
    ACCESS_DENIED = 'AUTH_2001',
    INSUFFICIENT_PERMISSIONS = 'AUTH_2002',
    
    // Validation Errors (3000-3999)
    VALIDATION_FAILED = 'VAL_3001',
    INVALID_INPUT = 'VAL_3002',
    
    // Not Found Errors (4000-4999)
    RESOURCE_NOT_FOUND = 'NOT_FOUND_4001',
    USER_NOT_FOUND = 'NOT_FOUND_4002',
    
    // Database Errors (5000-5999)
    DATABASE_ERROR = 'DB_5001',
    DUPLICATE_ENTRY = 'DB_5002',
    
    // System Errors (9000-9999)
    INTERNAL_ERROR = 'SYS_9001',
    SERVICE_UNAVAILABLE = 'SYS_9002',
}

@catch()
export class CustomExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('Exceptions');

    catch(exception : unknown, host: ArgumentHost){
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        // get status code
        const status = exception instanceof HttpException ?
        exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

        // get error code and message
        const errorResponse = this.getErrorResponse(exception, status);

        // log error with stack trace
        this.logger.error(
        --- error code -- method -- url )
    }
}


// ========= Specific Exception Filter

// ============  custom validation pipe 