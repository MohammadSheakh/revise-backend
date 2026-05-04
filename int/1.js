// bad code

const orders = await Order.find({ userId : req.user.id })
// loop through each order to fetch user details (BAD)
const ordersWithUser = await Promise.all(
    orders.map(async (order) => {
        const user = await User.findById(order.userId); // separate query for every order
        return { ...order.toObject(), user };
    
    })
)
// good code (using populate)
const orders = await Order.find({ userId : req.user.id })
            .populate('userId', 'name email')
            .exec();

res.json({ success : true, orders })

// better code - for complex logic- aggregation

const orders = await Order.aggregate([
    { $match : { userId: new mongoose.Types.ObjectId(req.user.id)}},
    {
        $lookup : {
            from : 'users',
            localField : 'userId',
            foreignField : '_id',
            as : 'userDetails'
        }
    },
    {
        $unwind: '$userDetails'
    },
    {
        $project : {
            orderId : 1,
            amount: 1,
            userName : '$userDetails.name',
            userEmail : '$userDetails.email'
        }
    }
])

//-------------------
/*
Question : api endpoint is becoming very slow as the product table 
grows to 1 million records .. how can you optimize this

Answer : we can analyze the query pattern and add appropriate
indexes in MongoDB

why compound index : if i only index category, mongodb finds the docs
but still has to sort them by price in memory (slow). 

if we only index price, it cant efficiently filter by category .. 
the compound index handles both .. 


i would verify the performance improvement by running 

db.products.find(...).explain('executionStats') to check if the 
index is being used (IXSCAN) and if the totalDocsExamined is low .. 
*/

// Common theory Question
// SQL vs NoSQL
/*
data structure is rigid and relational
acid complience is critical
complex joins are frequent

data schema is flexible or evolving rapidly
high write throughput is needed
horizontal scaling (sharding) is anticipated


>>>>>>> 
*/

//> Authentication (JWT) & Security Best Practices
/*

ex the diff between session-based auth and token-based auth
why JWT is preferred

Session based : server store user data in memory
the client receives a session Id (cookie)
hard to scale horizontally (require sticky session or shared 
session store)

Token Based(JWT) : 
the server generate a signed JSON web token containing user claims
(ID, Role)

the client stores the token, 
the server verifies the signature using a secret key.  no database
lookup  needed for every request
stateless, scalable, perfect for microservice

Access token should be short lived, refresh tokens are long
lived .. and stored securely (http only cookie).. when the 
access token expires, the client uses the refresh token to get a 
new
*/