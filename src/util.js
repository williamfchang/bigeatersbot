
// get SQL user id from discord username
export async function getUserId(db, username) {
    const { results } = await db.prepare("SELECT * FROM users WHERE discordUsername = ?")
        .bind(username).run();
    return results[0]?.userId || -1;
}