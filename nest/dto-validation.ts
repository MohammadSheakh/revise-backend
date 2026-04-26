/*
1. understand class validator - all decorator, custom validators
2. class transformer - automatic type conversion, serialization
3. advance validation pattern - conditional validation, nested validation, arrays
4. reusable validation rules - custom decorators, validation utilities
5. implement dto inheritance - base dto, partial dto, pick omit pattern
*/

// -- DTO fundamentals -> data transfer object
@Post()
async create(@Body(new ValidationPipe()) body : CreateUserDto) {
    // fully validated
    return this.service.create(body);
}

// DTO Anatomy : Complete Example
import {
    IsEmail,
    IsString,
    IsNumber,
    MinLength,
    MaxLength,
    IsOptional,
    IsEnum,
    Min, 
    Max,
    IsBoolean,
    IsDateString
} from 'class-validator';

//--- enum for type safety
export enum UserRole {
    USER = 'user',
    ADMIN = 'admin',
    MODERATOR = 'moderator'
}

// -- DTO Class
export class CreateUserDto {
    // required email field
    @ApiProperty({
        description : "User email address",
        example : "a@gmail.com",
        required : true,
    })
    @IsEmail({}, { message : "provide valid email address"})
    @IsString()
    @MaxLength(33, { message : ''})
    email : string;

    @ApiProperty({
        description : "user password ( min 8 char)",
        example : "Password q23",
        required : true, 
        minLength  :9
    })
    @IsString()
    @MinLength(8, { message : "password must be at least 8 character long "})
    password: string;
}

// ------ Class Validator Decorators

//--- string validator deep dive
export class ProductDto {
    // basic string validation
    @IsString({ message : "Title must be a string "})
    @IsNotEmpty({ message : 'Title is required' })
    // length constraints
    @MinLength(3, {message : 'Title must be at least 3 character'})
    //email validation
    @IsEmail(
        { allow_display_name : true, require_tld : true },
        { message : 'Please provide a valid email address' }
    )
    // url validation
    @IsURL(
        { require_protocol : true, require_tld: true },
        { message : 'please provide a valid URL with protocol (http/ https) '}
    )

    // regex pattern matching
    @Matches(/^[a-zA-Z0-9_-]/,{
        message : "username can only contain letter, number, underscore, hyphen"    
    })

    // complex password validation
    // phone number validation
    @Matches(/^\+?[\d\s-()]+$/, {
        message : 'please provide a valid phone number'
    })
    title : string;

    
    //--------- number validators deep dive

    // basic number validator
    @IsNumber({}, { message : 'pinNumber must be a number'})

    // range validation
    @Min(0, { message : "price can not be negative"})
    @Max(9999, { message : "price can not exceed 434343"})

    // decimal places
    @IsNumber({ maxDecimalPlaces : 2 }, { message: "price can have max 2 decimal palces"})

    // integer validation
    @IsInt({ message : 'Quantity must be an integer'})

    // positive / negative number
    @IsPositive({ message : "Amount must be positive"})

    @IsNegative({ message : "Must be negative"})
    pinNumber : number;


    //------------ Array validators deep dive

    @IsArray({ message : "Tags must be an array"})
    @IsString({ each : true, message : ""})

    // array size constraints
    @ArrayMinSize(1, { message : ""})
    @ArrayMaxSize(2, { messsage : ""})

    tags : string[]


    // array of objects with nested validation
    @ValidatedNested({ each : true})
    @TypeError(() => LessonDto)
    lessons : LessonDto[]
}

export class LessonDto { 
    @IsString()
    @IsNotEmpty()
    title : string;

}


// ---------- Advance Validation Pattern

// --- 1. Conditional Validation
import {
    IsString,
    IsOptional,
    IsNotEmpty,
    ValidateIf,
    Minlength,
} from 'class-validator';

export class UpdateUserDto {

    // validate only if "email" is provided
    @ValidateIf((object, value) => value != undefined)
    email? : string;

    // validate password only if changing password
    @ValidateIf((object, value) => object.changePassword === true)
    @IsString()
    @MinLenght(8, { message : 'Password must be at least 8 characters'})
    newPassword ? : string;

    changePassword ? : boolean;


    // validate company only for business users
    @ValidateIf((object) => object.userType === 'business')
    @IsString()
    @IsNotEmpty()
    company? : string;

    userType : 'personal' | 'business'
}

// ---------  Nested DTO validation
export class AddressDto{
    @IsString()
    @IsNotEmpty()
    street : string;
}

// shipping info DTO (nested)
export class ShippingInfoDto {
    @IsString()
    @IsNotEmpty()
    carrier : string;

    @ValidateNested()
    @Type(() => AddressDto)
    address : AddressDto
}


// ------ Dto Inheritance And Composition
export class BaseDto {
    @ApiProperty({ description : 'Record ID', example : 'rec_123'})
    @IsString()
    @IsNotEmpty()
    id : string;

    @ApiProperty({ description : 'Created timestamp'})
    createdAt : string;

    @ApiProperty({ description : 'Updated timestamp'})
    updatedAt : string;
}

// --- Create DTO (fields for creation)
export class CreateUserDto{
    @IsEmail()
    email : string;

    @IsString()
    @MinLength(8)
    password: string;

    @IsString()
    name : string;
}

// --- Response DTO
export class UserResponseDto extends BaseDto {
    @ApiProperty({ example : '@example.com'})
    email : string;

    @ApiProperty({example : "name..."})
    name : string;

    @ApiProperty({ example : true})
    isActive: boolean;
}

// ------ Paginated Response DTO
export class PaginatedUsersDto {
    @ApiProperty({ type : [ UserResponseDto ]})
    data: UserResponseDto[];

    @ApiProperty({ example : 199})
    total : number;

    @ApiProperty({ example : 199})
    total : number;
    
    @ApiProperty({ example : 199})
    page : number;
    
    @ApiProperty({ example : 199})
    limit : number;

    @ApiProperty({ example : 199})
    totalPages: number;

}

//--- pick / omit pattern
