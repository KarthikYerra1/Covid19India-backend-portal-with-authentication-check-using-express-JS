const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server has been started");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//Middleware function to check if the user is logged in
const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeaders = req.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "loginUserSuccess", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  }
};

const convertStatesDbResponseToJsonObject = (state) => {
  return {
    stateId: state.state_id,
    stateName: state.state_name,
    population: state.population,
  };
};

//Login API
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const getUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const getUser = await db.get(getUserQuery);
  if (getUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(password, getUser.password);
    if (isPasswordCorrect) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "loginUserSuccess");
      res.status(200);
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

//Get All states API
app.get("/states/", authenticateToken, async (req, res) => {
  const getStatesQuery = `
    SELECT * FROM state
  `;
  const states = await db.all(getStatesQuery);
  res.send(states.map((each) => convertStatesDbResponseToJsonObject(each)));
});

//Get a specific state using stateId API
app.get("/states/:stateId/", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getStateQuery = `
        SELECT * FROM state WHERE state_id = ${stateId}
    `;
  const state = await db.get(getStateQuery);
  res.send(convertStatesDbResponseToJsonObject(state));
});

//Create a district API
app.post("/districts/", authenticateToken, async (req, res) => {
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const addDistrictQuery = `
        INSERT INTO district(district_name, state_id, cases, cured, active, deaths)
        VALUES(
            '${districtName}',
            ${stateId},
            ${cases},
            ${cured},
            ${active},
            ${deaths}
        )
    `;
  const addDistrict = await db.run(addDistrictQuery);
  res.send("District Successfully Added");
});

//Get specific details of District using District Id API
app.get("/districts/:districtId/", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const getDistrictQuery = `
        SELECT * FROM district WHERE district_id = ${districtId}
    `;
  const district = await db.get(getDistrictQuery);
  res.send({
    districtId: district.district_id,
    districtName: district.district_name,
    stateId: district.state_id,
    cases: district.cases,
    cured: district.cured,
    active: district.active,
    deaths: district.deaths,
  });
});

//Delete District using ID API
app.delete("/districts/:districtId/", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const deleteDistrictQuery = `
        DELETE FROM district WHERE district_id = ${districtId}
    `;
  const dbResponse = await db.run(deleteDistrictQuery);
  res.send("District Removed");
});

//Update district Data API
app.put("/districts/:districtId/", authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const updateDistrictQuery = `
        UPDATE district
        SET
         district_name = '${districtName}',
         state_id = ${stateId},
         cases = ${cases},
         cured = ${cured},
         active = ${active},
         deaths = ${deaths}
        WHERE district_id = ${districtId}
    `;
  const dbResponse = await db.run(updateDistrictQuery);
  res.send("District Details Updated");
});

//Get statistics of a state using stateId API
app.get("/states/:stateId/stats/", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getStatsQuery = `
        SELECT 
        SUM(cases) as totalCases,
        SUM(cured) as totalCured,
        SUM(active) as totalActive,
        SUM(deaths) as totalDeaths
        FROM district JOIN state ON district.state_id = state.state_id
        WHERE state.state_id = ${stateId}
    `;
  const stateStats = await db.get(getStatsQuery);
  res.send(stateStats);
});

module.exports = app;
