from flask import Flask, render_template, request, redirect
import firebase_admin
from firebase_admin import credentials, auth, exceptions

app = Flask(__name__)
app.secret_key = "your-secret-key"

# Initialize Firebase
try:
    cred = credentials.Certificate("firebase-adminsdk.json")
    firebase_admin.initialize_app(cred)
    print("🔥 Firebase initialized!")
except Exception as e:
    print(f"⚠️ Firebase init error: {e}")


# Routes
@app.route("/")
def home():
    return render_template("index.html")


@app.route("/login")
def login():
    return render_template("login.html")


@app.route("/signup", methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        try:
            user = auth.create_user(
                email=email,
                password=password
            )
            # Send verification email
            auth.generate_email_verification_link(email)
            return redirect('/login?signup_success=1')
        except Exception as e:
            return render_template("signup.html", error=str(e))
    return render_template("signup.html")


@app.route("/welcome")
def welcome():
    return render_template("welcome.html")


# SINGLE DASHBOARD ROUTE (no duplicates)
@app.route("/dashboard")
def dashboard():
    id_token = request.cookies.get("token")

    if not id_token:
        print("No token found - redirecting to login")
        return redirect("/login")

    try:
        decoded_token = auth.verify_id_token(id_token)
        return render_template("dashboard.html")
    except (ValueError, exceptions.FirebaseError) as e:
        print("Token verification failed:", str(e))
        return redirect("/login")


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=True)
