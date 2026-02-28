# How to Push Your Somnia Dashboard to GitHub

This is a complete, safe guide for pushing your project to a GitHub repository, specifically making sure we exclude the heavy `node_modules` folder to prevent Git from freezing or getting stuck again!

---

## Step 1: Add a `.gitignore`

The most critical step in any Node.js project is telling Git **not** to track your installed dependencies.
(We've already done this for you, but it's good to double-check!)
1. Ensure you have a file named exactly `.gitignore` in your project folder.
2. Ensure it contains the word `node_modules` on a line by itself.

---

## Step 2: Make Git "Forget" Existing Files
If you ever accidentally added `node_modules` to Git before, you must tell Git to clear it from its memory. (This command only deletes it from Git's cache, it will *not* delete the files off your computer).

Run this in your terminal:
```bash
git rm -r --cached node_modules
```

---

## Step 3: Save the Exclusions
Now that we've told Git to ignore `node_modules` and cleared the cache, we need to save that instruction into Git.

Run these two commands:
```bash
git add .
git commit -m "chore: ignore node_modules securely"
```

---

## Step 4: Add Your GitHub Link

Tell your local repository where your GitHub repository lives. (If you get a message saying "remote origin already exists," you can just skip this step).

```bash
git remote add origin https://github.com/bran21/SomiBoardy.git
```

---

## Step 5: Push Your Code Safely!

Finally, you can securely push all of your original code up to GitHub. Because of the steps we took above, this will skip the heavy `node_modules` and should happen very quickly without any freezing!

*(Note: We are using `--force` here just in case your GitHub repo already has conflicting files from previous failed push attempts).*

```bash
git push -u origin main --force
```

---

🎉 **Congratulations!** Your project is now safely backed up on GitHub!
