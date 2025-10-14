# Training PDFs Required

This folder needs the following PDF files for the training system to work in production:

## Required Training PDF Files:

1. **Preservation-FOD.pdf** - Preservation & Foreign Object Debris training
2. **Chemical-Handling.pdf** - Chemical Handling Safety training  
3. **Fire-Safety.pdf** - Fire Safety Procedures training
4. **ITAR.pdf** - International Traffic in Arms Regulations training
5. **AS9100.pdf** - AS9100 Quality Management training
6. **Counterfeit-Prevention.pdf** - Counterfeit Prevention training
7. **Ethics.pdf** - Workplace Ethics training
8. **Nonconforming-Items.pdf** - Non-Conforming Items Procedures training
9. **Shutdown-Procedures.pdf** - Facility Shutdown Procedures training

## Instructions:

1. Upload each PDF file to this folder with the exact filename shown above
2. After uploading, the files will automatically be included in the next deployment
3. The build process (npm run build) will copy this entire folder to dist/attached_assets/training/

## Current Status:
- ✅ Folder structure created
- ⏳ Waiting for PDF files to be uploaded
