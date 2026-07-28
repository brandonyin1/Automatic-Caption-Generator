
        // Initialize application
        let captionGen;
        document.addEventListener('DOMContentLoaded', () => {
            captionGen = new ProfessionalCaptionGenerator();
        });

        // Warn before leaving if there's processed caption work that hasn't been
        // downloaded - it only lives in memory. Deliberately does NOT run cleanup()
        // here: if the user cancels the navigation, the audio blob URLs it would
        // revoke are still in use by the page.
        window.addEventListener('beforeunload', (e) => {
            if (captionGen && captionGen.hasUnsavedWork()) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // Fires only once the page is actually being discarded (after any
        // beforeunload prompt is resolved), so it's safe to revoke object URLs here.
        window.addEventListener('pagehide', () => {
            if (captionGen) {
                captionGen.cleanup();
            }
        });
