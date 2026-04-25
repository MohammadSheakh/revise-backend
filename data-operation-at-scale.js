// issue 
for(id of taskIds){
    await prisma.task.update(...)
}

// sol-> one sql query -> much faster atomic scalable

const updated = await prisma.$executeRaw // this is for insert/update/delete
// it return number of row affected .. 

// so we need to use $queryRaw .. it return the result of the query

const updated = await prisma.$queryRaw`
    UPDATE tasks
    SET status = ${status}::"TaskStatus" // casting to postgres enum // ensure valid enum values allowed // prevents invalid strings
    // Conditional column update
    "completedAt" = CASE 
        WHEN ${status}::"TaskStatus" = "COMPLETED" THEN NOW()
        ELSE NULL
    END
    "updatedAt" = NOW()

    WHERE id = ANY($(taskIds))
    AND "deletedAt" IS NULL
    RETURNING id, status, "completedAt";
`

return updated;
}

//----> what to avoid
for(const id of taskIds){
    await prisma.task.update({
        where : {id},
        data : {status}
    })
}
// senior pattern -- let the database do the work in one query

await prisma.$queryRaw`
    UPDATE tasks
    SET status = ${status}
    WHERE id = ANY($(taskIds))
`
// -> conditional update (business logic in sql)

await prisma.$queryRaw`
    UPDATE tasks
        SET status = ${status},
            "completedAt" = CASE
            WHEN ${status} = 'COMPLETED' THEN NOW()
        ELSE NULL
    END
`;

-> bulk insert ( high throughput )
await prisma.$executeRaw`
    INSERT INTO tasks(id, title, status)
    SELECT * FROM UNNEST(
        ${ids}::uuid[],
        ${title}::text[],
        ${statuses}::"TaskStatus" 
    )
`

//-- upsert at scale
await prisma.$executeRaw`
    INSERT INTO tasks(id, status)
    VALUES ${Prisma.join(values)}
    ON CONFLICT(id)
    DO UPDATE SET status = EXCLUDED.status
`

await prisma.$queryRaw`
    SELECT status, COUNT(*)
    FROM tasks
    GROUP BY status 
`

// Delete








