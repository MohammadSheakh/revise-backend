//-- repository pattern

@Injectable()
export class UserRepository{
    constructor(
        @InjectModel(User.name) private userModel : Model<User>
    ){}

    // create
    async create(data : Partial<UserDocument>) : Promise<UserDocument> {
        return this.userModel.create(data);
    }

    // find by Id 
    async findById(id: string, populate? : string[]): Promise<UserDocument> {
        let query = this.userModel.findById(id);

        if(populate && populate.length > 0) {
            populate.forEach(field => {
                query = query.populate(field);
            }) 
        }

        return query.exec();
    }

    // find all with pagination
    async fundAll(
        page : number = 1,
        limit : number = 10,
        filters? : any,
        sortBy : string = '-createdAt'
    ): Promise<{data : UserDocument[], total : number}>{
        const query = this.buildQuery(filters);

        const data  = await this.userModel.find(query).sort(sortBy)
        .skip((page - 1) * limit) .limit(limit).lean().exec()
    }

    private buildQuery(filters : any) :any {
        const query : any  = { isDeleted : false };
        if(filters){
            if(filters.email){
                query.email = new RegExp(filters.email, 'i')
            }
            if(filters.role ){
                query.role = filters.role
            }
            if(filters.isActive !== undefined){
                query.isActive = filters.isActive
            }
            if(filters.createdAtFrom){
                query.createdAt = { $gte : new Date(filters.createdAtFrom) };
            }

            if(filters.createdAtTo){
                query.createdAt =  { ...query.createdAt, $lte : new Date(filters.createdAtTo)}
            }
        }

        return query;
    }
}

// --- Services using Repository
@Injectable()
export class UserService {
    constructor(
        private userRepository : UserRepository,
        private emailService : EmailService,
    ){}

    async create(dto : CreateUserDto) : Promise<UserDocument> {
        // check email uniqueness (using repository)
        const existingUser = await this.userRepository.findByEmail(dto.email);

        if(existingUser) {
            throw new ConflictException("Email is already exists")
        }

        // send welcome email
        await this.emailService.sendWelcome(user.email);

        return user;
    }
}