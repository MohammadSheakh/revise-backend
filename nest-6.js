@Schema({
    timestamps : true,
    toJSON: { virtuals : true },
    toObject : { virtuals : true }
})
export class User {
    // basic fields
    @ApiPropety({ description : "User email" , example : "a@gmail.com"})
    @prompt({
        type : String,
        required : [true, "email is required"],
        unique : true,
        lowercase : true,
        trim : true,
        maxlength : [355, "email can not exceed 5545"],
        match: [, "please provide valid"],
        
        minlength: [8, 'Password must be at least 8 characters'],
        select : false, // dont include in queries by default

    })
    email : string;

    @ApiProperty({
        description : "User role",
        enum : UserRole,
        example: UserRole.USER,
        default : UserRole.USER,
    })
    @prompt({
        type : String,
        enum : {
            values : Object.values(UserRole),
            message : "Invalid role, must be one of : ...."
        },
        default : UserRole.USER
    })
    role : UserRole;

    // Optional Fields
    @ApiPropertyOptional({ description : "Phone Number", example : "+32323232"})
    @Prop({
        type : String,
        trim : true,
        match : [, "Please provide a valid phone number"]
    })
    profileNumber?  : string;

}

export const UserSchema = SchemaFactory.createForClass(User)

// compound indexs (for common query pattern)
UserSchema.index({role : 1, status: 1})

// partial index ( only index active users) 
UserSchema.index(
    { lastLoginAt : 1},
    { partialFilterExpression : { status : UserStatus.ACTIVE }}
) 

// ttl index ( auto delete inactive users after 1 year)
UserSchema.index(
    { updatedAt : 1 },
    {
        expireAfterSeconds : 365 * 24 * 60 * 60, // 1 year
        partialFilterExpression : { status : UserStatus.INACTIVE },
    }
)

// - learn virtuals 

// virtual populate
UserSchema.virtual('tasks', {
    ref : 'Task',
    localField : '_id',
    foreignField : 'ownerUserId',
    options : {
        sort : {createdAt : 1},
        limit : 10,
        match : {isDeleted : false} // only non deleted tasks
    }
})

// virtual populate : get users organizations
UserSchema.virtual('organizations', {
    ref: 'Organization',
    localField : '_id',
    foreignField : 'members'
})

// pre hook 
// pre save hook | hash password before saving
UserSchema.pre('save', async function(next){
    // only hash if password is modified
    if(!this.isModified('password')){
        return next()
    }

    // import package and hash with in try catch
    try{
        // ...
        next()
    }catch(error){
        next(error as Error)
    }
})

// Instance Methods
UserSchema.methods.comparePassword = async function(candidatePassword : string){
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(--, --) // return boolean
}

// Static methods
UserSchema.statics.findActiveUsers = async function(this: Model<User> ){
    return this.find({
        status : UserStatus.ACTIVE,
        isDeleted: false,
    })
}

// -- export type
export type UserDocument = User & Document
export const UserModel = models.User || model<User>('User', userSchema)


// -- Advance Indexing Strategies

// pattern 1 : filter by role and status
User.find({ role : 'admin', status : 'active' }).sort({createdAt : -1})


// pattern 2

User.findOne({ email : "user@gmail.com"})
UserSchema.index({email : 1}, { unique : true})

// pattern 3

User.find({status : 'active'}).sort({ lastLoginAt : -1 })
// optimal index
UserSchema.index(
    {lastLoginAt : -1},
    { partialFilterExpression : { status : 'active'}}
)

// text search
User.find



