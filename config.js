/* ============================================================
   Deployment config. This is the ONLY file that changes when
   you connect the board to a database or move it to a new client.

   Leave supabase blank and everything still works — feedback
   saves to the browser only (fine for solo review, no sharing).
   Fill it in and feedback + ideas become shared and persistent.
   ============================================================ */
window.DRAPER_CONFIG = {
  supabaseUrl: "",   // e.g. https://abcdefgh.supabase.co
  supabaseKey: "",   // the anon / publishable key

  /* Anyone visiting index.html?studio=<this word> gets studio mode:
     they can write the idea copy and read the feedback summary.
     Plain visitors can only read ideas and write feedback.        */
  studioKey: "draper",

  pollSeconds: 15,   // how often to pick up other people's changes

  /* Every client board that lives in projects/. The first one is the
     default; studio mode gets a brand switcher in the sidebar that
     loads any of the others via ?project=<folder>.                 */
  projects: [
    { folder: "the-boulders", label: "The Boulders" },
    { folder: "_example",     label: "Example Client" },
  ],
};
