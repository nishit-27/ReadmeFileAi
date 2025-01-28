require('dotenv').config();
const AdmZip = require("adm-zip");
const fs = require('fs').promises;
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

app.use(cors());
app.use(express.json());

app.post('/generate-readme', async (req, res) => {
    try {
        const { repoUrl } = req.body;
        
        if (!repoUrl) {
            return res.status(400).json({ error: 'Repository URL is required' });
        }
        
        // Extract owner and repo from GitHub URL
        const urlParts = repoUrl.split('/');
        if (urlParts.length < 2) {
            return res.status(400).json({ error: 'Invalid repository URL format' });
        }
        
        const owner = urlParts[urlParts.length - 2];
        const repo = urlParts[urlParts.length - 1];
        
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/main`;
        
        console.log('Fetching from:', apiUrl); // Debug log
        
        const readmeContent = await generateCompleteReadme(apiUrl, repo);
        
        // Clean up temporary files
        try {
            await fs.unlink('./downloadedFile.zip');
            await fs.rm('./extractedFile', { recursive: true, force: true });
        } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError);
        }
        
        res.json({ readme: readmeContent });
    } catch (error) {
        console.error('Error in generate-readme:', error); // Debug log
        res.status(500).json({ 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

async function analyzeRepo(directory) {
    const analysis = {
        dependencies: {},
        entryPoints: [],
        structure: [],
        configFiles: []
    };

    async function scanDir(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            
            if (entry.isDirectory()) {
                await scanDir(fullPath);
            } else {
                analysis.structure.push(fullPath);

                // Detect dependency files
                if (entry.name.match(/package\.json|requirements\.txt|pom\.xml|build\.gradle/i)) {
                    const content = await fs.readFile(fullPath, 'utf8');
                    analysis.dependencies[entry.name] = content;
                }

                // Detect configuration files
                if (entry.name.match(/^(docker-compose|config|\.env|Makefile)/i)) {
                    analysis.configFiles.push(entry.name);
                }
            }
        }
    }

    await scanDir(directory);
    return analysis;
}

async function generateReadmeSections(analysis) {
    const prompts = {
        overview: `Create a project overview based on repository structure:
        - Main files: ${analysis.structure.join(', ')}
        - Configuration files: ${analysis.configFiles.join(', ')}
        - Dependency managers: ${Object.keys(analysis.dependencies).join(', ')}
        Write a 2-paragraph description focusing on project purpose and requirements.`,

        installation: `Generate detailed installation instructions including:
        1. Cloning the repository
        2. Dependency installation
        3. Configuration setup
        4. Running the project locally
        
        Base this on:
        - Dependency files: ${Object.keys(analysis.dependencies).join(', ')}
        - Config files: ${analysis.configFiles.join(', ')}
        - Project structure: ${analysis.structure.join('\n')}
        
        Provide exact terminal commands for Linux/macOS/Windows.`,
    };

    const sections = {};
    
    // Generate Installation section first with more focus
    try {
        const result = await model.generateContent(prompts.installation);
        const response = await result.response;
        sections.installation = response.text();
    } catch (error) {
        console.error('Error generating installation:', error);
        sections.installation = "## Installation\n\nAuto-generation failed. Please check the repository manually.";
    }

    // Generate Overview
    try {
        const result = await model.generateContent(prompts.overview);
        const response = await result.response;
        sections.overview = response.text();
    } catch (error) {
        sections.overview = "";
    }

    return sections;
}

async function generateCompleteReadme(url, repoName) {
    try {
        // Download and extract repo
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to download repo: ${response.status} ${response.statusText}`);
        }
        
        const zipBuffer = await response.arrayBuffer();
        const zipPath = "./downloadedFile.zip";
        await fs.writeFile(zipPath, Buffer.from(zipBuffer));

        const zip = new AdmZip(zipPath);
        const extractPath = "./extractedFile";
        
        // Clean up extract path if it exists
        try {
            await fs.rm(extractPath, { recursive: true, force: true });
        } catch (error) {
            console.error('Error cleaning up extract path:', error);
        }
        
        zip.extractAllTo(extractPath, true);

        // Analyze repo
        const analysis = await analyzeRepo(extractPath);
        
        // Generate README content
        const readmeSections = await generateReadmeSections(analysis);
        
        // Compile final README with installation focus
        const readmeContent = [
            `# ${repoName}`,
            `## Overview\n${readmeSections.overview}`,
            `## Getting Started\n${readmeSections.installation}`
        ].join('\n\n');

        return readmeContent;
    } catch (error) {
        console.error('Error in generateCompleteReadme:', error); // Debug log
        throw new Error(`Failed to generate README: ${error.message}`);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});