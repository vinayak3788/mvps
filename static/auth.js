// Initialize Firebase Auth state listener
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // User is logged in
        console.log("User logged in:", user.email);
        user.getIdToken().then((idToken) => {
            // Set token as cookie (secure)
            document.cookie = `token=${idToken}; path=/; max-age=${3600}`;
            window.location.href = "/dashboard";  // Force redirect
        });
    }
});

function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    firebase.auth().signInWithEmailAndPassword(email, password)
        .catch((error) => {
            console.error("Login error:", error);
            alert("Login failed: " + error.message);
        });
}