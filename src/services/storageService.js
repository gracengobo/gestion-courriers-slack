const { minioClient, BUCKET_NAME } = require('../utils/minioClient');

async function uploadFile(fileBuffer, fileName) {
    try {
        const objectName = `${Date.now()}-${fileName}`;
        await minioClient.putObject(BUCKET_NAME, objectName, fileBuffer);
        console.log(`Fichier uploadé : ${objectName}`);
        return objectName;
    } catch (error) {
        console.error("Erreur lors de l'upload MinIO :", error);
        throw new Error("Impossible de sauvegarder le fichier.");
    }
}

module.exports = { uploadFile };