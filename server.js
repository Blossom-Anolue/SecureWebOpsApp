import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pdfRoutes from './routes/pdfRoutes.js'; // Note the .js at the end

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/pdf', pdfRoutes);

app.get('/', (req, res) => res.send('SecureWebOps Backend is Running Securely'));

app.listen(PORT, '0.0.0.0' , () => {
    console.log(`[SUCCESS] Server started on port ${PORT}`);
console.log(`Accessible at http://172.20.0.220:${PORT}`);

});
