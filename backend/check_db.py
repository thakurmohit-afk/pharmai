
import sqlite3

try:
    conn = sqlite3.connect('pharmacy.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print("Tables found:", [t[0] for t in tables])
    
    if 'users' in [t[0] for t in tables]:
        cursor.execute("PRAGMA table_info(users);")
        columns = cursor.fetchall()
        print("\nColumns in 'users':")
        for col in columns:
            print(col)
    else:
        print("\nTable 'users' NOT found.")

    conn.close()
except Exception as e:
    print(e)
