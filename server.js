const http = require("http");
const path = require('path');
const multer = require('multer');
const express = require('express');
const app = express();
const server = http.createServer(app);  // Use the server for Socket.IO
const io = require('socket.io')(server);  // Initialize socket.io with the server
const PORT = 3000;
const mysql = require('mysql2');
const cors = require('cors');
const session = require('express-session'); // Only require it once

// Middleware for sessions
app.use(
    session({
        secret: '@Aditya.254', // Replace with a strong secret
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // Set `secure: true` in production with HTTPS
    })
);

// Middleware to parse URL-encoded data
app.use(cors()); // Enable CORS
app.use(express.json()); // Parses JSON payloads
app.use(express.urlencoded({ extended: true })); // Parses URL-encoded payloads

// Serve static files from the "public" directory
app.use(express.static(__dirname + '/public'));


// Middleware for serving static files
app.use('/uploads', express.static('uploads'));

// Set up Multer for image uploads
const storage = multer.diskStorage({
    destination: './uploads/', // Upload folder
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname)); // Save file with timestamp
    },
  });
  

const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB size limit
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/gif'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg, and .gif formats are allowed!'), false);
    }
  },
});

// ---------------- Database Connection ---------------- //

// Create a connection to the database 
const con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Aditya.254',
    database: 'buysell'
});

// Connect to the database once when the server starts
con.connect(function (err) {
    if (err) throw err;
    console.log("Connected to the database");
});

// Serve the home page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/home.htm'); // Adjust the path as necessary
});

// - ---------------- sign up ------------------------- - //

// Handle form submission for signup
app.post('/sign', (req, res) => {
    const { email, password, username, mobile, address } = req.body;

    // Debugging: Log the received data
    console.log('Received data:', { username, email, password, mobile, address });

    // Define your SQL query to insert a new user
    const insertSql = `INSERT INTO userinfo (username, email, password, mobile_no, address) VALUES (?, ?, ?, ?, ?)`;

    // Execute the insert query
    con.query(insertSql, [username, email, password, mobile, address], function (err, insertResult) {
        if (err) {
            console.error("Error inserting data: ", err);
            return res.status(500).send("username or email id is already occupied choose different one !"); // Send an error response
        }
        console.log('Inserted new user with ID:', insertResult.insertId);
        res.send(`User ${username} with email ${email} has been registered. Please LOG IN to open account.`);
    });
});


// Login Route
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const selectSql = `SELECT * FROM userinfo WHERE email=?`;

    con.query(selectSql, [email], (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).json({ error: 'Database query error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = results[0];

        if (user.password === password) { // Use hashed passwords in production!
            req.session.user_id = user.id;
            console.log('Logged in user ID:', req.session.user_id);
            return res.redirect('/dashboard.htm'); // Redirect to dashboard.htm
        } else {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
    });
});

// Dashboard Route
app.get('/dashboard.htm', (req, res) => {
    if (!req.session.user_id) {
        return res.redirect('/login.htm'); // Redirect to login if not authenticated
    }

    res.sendFile(path.join(__dirname, 'public', 'dashboard.htm'));
});

// API Route for Dashboard Data
app.get('/api/dashboard-data', (req, res) => {
    if (!req.session.user_id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const selectSql = `SELECT * FROM items_for_sale`;

    con.query(selectSql, (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).json({ error: 'Database query error' });
        }

        res.json(results); // Send items as JSON
    });
});



/********************* sell **************************** */

app.post('/sell', upload.single('itemImage'), (req, res) => {
    const user_id = req.session.user_id;
  
    if (!user_id) {
      return res.status(403).json({ error: 'User is not logged in' });
    }
  
    const { itemName, itemDescription, itemPrice, itemType, itemAddress } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Image upload failed. Please try again.' });
    }
  
    const ipath = `/uploads/${req.file.filename}`;
  
    if (!itemName || !itemDescription || !itemPrice || !itemType || !itemAddress) {
      return res.status(400).json({ error: 'All item details are required' });
    }
  
    const insertSql = `
      INSERT INTO items_for_sale (user_id, item_name, description, price, type, address, image) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
  
    con.query(insertSql, [user_id, itemName, itemDescription, itemPrice, itemType, itemAddress, ipath], (err, result) => {
      if (err) {
        console.error("Error inserting item data:", err);
        return res.status(500).send("Error inserting item data");
      }
      console.log('Inserted new item with ID:', result.insertId);
      res.send(`Your item "${itemName}" has been registered successfully!`);
    });
  });
  



/**** ********** Fetch user data for the profile page ************** **** */

app.get('/profile', (req, res) => {
    // Check if the user is logged in by checking session
    const user_id = req.session.user_id;
    
    if (!user_id) {
        return res.status(403).json({ error: 'You must be logged in to view this page.' });
    }
    
    // Query to get user data from the database
    const selectSql = `SELECT 
    i.item_id, 
    i.item_name, 
    i.description, 
    i.price, 
    i.type, 
    i.date_added AS item_date_added, 
    i.address AS item_address, 
    i.image, 
    u.id AS user_id, 
    u.username, 
    u.email, 
    u.mobile_no, 
    u.address AS user_address
FROM 
    items_for_sale i
JOIN 
    userinfo u
ON 
    u.id = i.user_id
WHERE 
    u.id = ?;
`;
    
    con.query(selectSql, [user_id], (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).json({ error: 'Database query error' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Send the user data back as a response
        const user = results;
        console.log(user);
        res.json(user);
    });
});

/*****************  product .htm *************************** */

// Route to serve the `product.htm` file
app.get('/product.htm', (req, res) => {
    res.sendFile(path.join(__dirname, 'product.htm')); // Replace with the actual path to product.htm
});

// API to fetch product details
app.get('/api/products/:id', (req, res) => {
    const productId = req.params.id;

    const selectSql = `SELECT * FROM items_for_sale WHERE item_id = ?`;

    con.query(selectSql, [productId], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ error: 'Database query error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json(results[0]); // Send the product details
    });
});




// Socket.IO event handling
io.on('connection', (socket) => {
    console.log('A user connected');
    
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});


// Start the server
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}/`);
});
