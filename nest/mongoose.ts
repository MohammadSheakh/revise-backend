// enum for type safety
export enum UserRole {
    USER = 'user',
    ADMIN = 'admin',
    MODERATOR = 'moderator',
}

export enum UserStatus {
    active = 'active',
    inactive = 'inactive'
}

//-- schema definition
@Schema({
    timestamps : true,
    toJSON : { virtuals : true},
    toObject : { virtuals : true },
})
export class User { 
    // basic fields
    @ApiProperty({ description : 'user email', example : "user@example.com"})
    @Prop({
        type : String,
        required : [true, 'email is required'],
        unique : true ,
        lowercase : true,
        trim : true,
        maxLength : [ 255, 'email can not exceed 455 characters'],
        // match : 
    })
    email : string,

    @ApiProperty({ description : "user password (hashed)", example : ""})
    @Prop({
        type : String,
        required : [ true, 'password is required'],
        minlength : [8, 'password must be at least 8 character'],
        select : false,
    })
    password : string;
}

// -- schema factory
export const UserSchema = SchemaFactory.createForClass(User);

// -- index

UserSchema.index({ role  : 1, status : 1, createdAt : 1})

// -- partial index
UserSchema.index(
    { lastLoginAt : 1}, 
    { partialFilterExpression : { status : UserStatus.Active}}
)

// -- virtuals
UserSchema.virtual('profileUrl').get(function() {
    return `/users/${this._id}`
})

// check if user is new (registerd within last 7 days)
UserSchema.virtual('isNewUser').get(function() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    return this.createdAt > sevenDaysAgo
})

// -- virtual populate
UserSchema.virtual('organizations', {
    ref: 'Organization', 
    localField : '_id',
    foreignField : 'members'
})

// -- pre hook middleware
UserSchema.pre('save', async function (next) {
    if(!this.isModified('password')){
        return next()
    }

    try{
        const bcrypt = await import('bcrypt');
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);

        next()
    }catch(error) {
        next(error as Error);
    }
})

// pre save hook : normalize email
UserSchema.pre('save', function(next){
    if(this.isModified('email') && this.email) {
        this.email = this.email.toLowerCase().trim();
    }

    next();
})

// Post-save hook : log user creation
UserSchema.post('save', function(doc) {
    console.log(`User created: ${doc.email} ( ${doc._id } )`)
})


// -- instance method
UserSchema.methods.comparePassword = async function(candidatePassword : string)  : Promise<boolean> {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(candidatePassword, this.password);
}

UserSchema.methods.updateLastLogin = async function(ip : string) {
    this.lastLoginAt = new Date();
    this.lastLoginIp = ip;
    await this.save();
}

UserSchema.methods.isEligibleForBonus = function(): boolean {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return this.createdAt < thirtyDaysAgo && this.status == UserStatus.active
}

// -- static methods
UserSchema.statics.findActiveUsers = async function(this:Model<User>) {
    return this.find({
        status : UserStatus.active,
        isDeleted : false,
    })
}

UserSchema.statics.findByEmail = async function(this, email : string){
    return this.findOne({ email : new RegExp(`^${email}$`, 'i')})
}

// -- Export
export type UserDocument = User & Document;
export const UserModel = models.User || model<User>('User', UserSchema);

// -- Geospatial Queries

// find users within 10km of location
User.find({
    location : {
        $near : {
            $geometry : { type : 'Point', coordinates : [lon, lat] },
            $maxDistance : 10000, // 10km in meters
        }
    }
})


// -- Query optimization

const query = User.find({ role : 'admin', status : 'active' })
    .sort({ createdAt : -1 })
    .populate('organization');

// get execution stats
const explain = await query.explain('executionStats')

console.log(JSON.stringify(explain, null, 2))


// -- n+1 query problem and solution

const users = await User.find({ organization : ordId })
    .populate({
        path : 'tasks',
        match : { isDeleted : false },
        options : { sort : { createdAt : -1 }, limit : 10 },
    })

    // result 2 queries.. (1 for users, 1 for all tasks)

// -- solution 2 : manual populate 
const users = await User.find({ organizationId : orgId })

// get all user IDs
const userIds = users.map(u => u._id);

// get all tasks for these users in One query
const tasks = await Task.find({
    ownerUserId : { $in : userids },
    isDeleted : false,
})

// map tasks to users
const tasksByUserId = new Map();
tasks.forEach(task => {
    const userId = task.ownerUserId.toString();
    if(!tasksByUserId.has(userId)) {
        tasksByUserId.set(userId, []);
    }
    tasksByUserId.get(userId).push(task);
})

// attach tasks to users
users.forEach(user => {
    user.tasks = tasksByUserId.get(user._id.toString()) || []
})

// 2 queries (more control then populate)

// Aggregation with lookup - 1 query - most efficient for complex queries