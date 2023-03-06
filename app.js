const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localserver:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const passwordLength = password.length;
  //Checking user details in database
  const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
  const userDetails = await db.get(getUserQuery);
  if (userDetails === undefined) {
    if (passwordLength < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
            INSERT INTO
            user(username,password,name,gender)
            VALUES
            (
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}'
            );`;
      const dbResponse = db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  //Checking user details in database
  const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
  const userDetails = await db.get(getUserQuery);
  if (userDetails !== undefined) {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  //Getting user Details from Database
  let { username } = request;
  const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
  const userDetails = await db.get(getUserQuery);
  const userId = userDetails.user_id;
  const getFourTweets = `
    SELECT
    username,tweet,date_time AS dateTime
    FROM
    follower
    INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    INNER JOIN user ON user.user_id = tweet.user_id
    WHERE
    follower.follower_user_id = ${userId}
    ORDER BY
    tweet.date_time DESC
    LIMIT
    4
    ;
    `;
  const tweetFeedObject = await db.all(getFourTweets);
  response.send(tweetFeedObject);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  //Getting userId from user name
  let { username } = request;
  const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
  const userDetails = await db.get(getUserQuery);
  const userId = userDetails.user_id;
  const getFollowingNames = `
    SELECT
    name
    FROM
    user INNER JOIN follower
    ON user.user_id = follower.following_user_id
    WHERE
    follower_user_id = ${userId};`;
  const followingUserDetails = await db.all(getFollowingNames);
  response.send(followingUserDetails);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  //Getting userId from user name
  let { username } = request;
  const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
  const userDetails = await db.get(getUserQuery);
  const userId = userDetails.user_id;
  const getFollowingNames = `
  SELECT
  name
  FROM
  user INNER JOIN follower
  ON user.user_id = follower.follower_user_id
  WHERE
  following_user_id = ${userId};`;
  const followingUserDetails = await db.all(getFollowingNames);
  response.send(followingUserDetails);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  //Getting user Details from Database
  const tweetId = request.params;
  let { username } = request;
  const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
  const userDetails = await db.get(getUserQuery);
  const userId = userDetails.user_id;
  const getUserFollowingTweets = `
  SELECT
  tweet.tweet,COUNT(like_id) AS likes,COUNT(reply_id)AS replies,tweet.date_time AS dateTime
  FROM
  follower 
  JOIN tweet ON follower.following_user_id = tweet.user_id
  JOIN reply ON tweet.tweet_id = reply.tweet_id
  JOIN like ON tweet.tweet_id = like.tweet_id
  WHERE
  follower.follower_user_id = ${userId} AND tweet.tweet_id = ${tweetId};
    `;

  try {
    const tweetsObject = await db.get(getUserFollowingTweets);
    response.send(tweetsObject);
  } catch (e) {
    response.status(401);
    response.send("Invalid Request");
    console.log(`Error Message ${e.message}`);
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const tweetId = request.params;
    let { username } = request;
    const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
    const userDetails = await db.get(getUserQuery);
    const userId = userDetails.user_id;
    const getUsernamesWhoLiked = `
  SELECT
  user.username
  FROM
  follower 
  INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN like ON like.tweet_id = tweet.tweet_id
  INNER JOIN user ON user.user_id = like.user_id
  WHERE
  follower.follower_user_id = ${userId} AND tweet.tweet_id = ${tweetId}
  ;`;
    try {
      const likedUsernameArray = await db.all(getUsernamesWhoLiked);
      response.send(likedUsernameArray);
    } catch (e) {
      response.status(401);
      response.send("Invalid Request");
      console.log(`Error Message ${e.message}`);
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const tweetId = request.params;
    let { username } = request;
    const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
    const userDetails = await db.get(getUserQuery);
    const userId = userDetails.user_id;
    const getRepliesOfUserTweet = `
  SELECT
  reply.reply
  FROM
  follower 
  INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
  WHERE
  follower.follower_user_id = ${userId} AND tweet.tweet_id = ${tweetId}
  ;`;
    try {
      const replayArray = await db.all(getRepliesOfUserTweet);
      response.send(replayArray);
    } catch (e) {
      response.status(401);
      response.send("Invalid Request");
      console.log(`Error Message ${e.message}`);
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
  const userDetails = await db.get(getUserQuery);
  const userId = userDetails.user_id;
  const getUserTweets = `
    SELECT
    tweet,COUNT(like_id)AS likes,COUNT(reply_id)AS replies , tweet.date_time AS dateTime
    FROM
    tweet 
    INNER JOIN like ON tweet.tweet_id = like.tweet_id
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE
    tweet.user_id = ${userId}
    ;`;
  try {
    const tweetsArray = await db.all(getUserTweets);
    response.send(tweetsArray);
  } catch (e) {
    response.status(401);
    response.send("Invalid Request");
    console.log(`Error Message ${e.message}`);
  }
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
  const userDetails = await db.get(getUserQuery);
  const userId = userDetails.user_id;
  const tweetMessage = request.tweet;
  const createTweetQuery = `
  INSERT INTO
  tweet(tweet,user_id)
  VALUES
  (
      '${tweetMessage}',
      ${userId}
  )`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const tweetId = request.params.tweetId;
    let { username } = request;
    const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';
    `;
    const userDetails = await db.get(getUserQuery);
    const userId = userDetails.user_id;
    const deleteTweetQuery = `
  DELETE FROM
  tweet
  WHERE
  tweet_id = ${tweetId} AND user_id = ${userId};
  `;
    try {
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } catch (e) {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
