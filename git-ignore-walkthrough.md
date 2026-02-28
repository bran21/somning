# How to Push to GitHub Without node_modules

It is very important to never push your `node_modules` folder to GitHub. It is massive, contains thousands of generated files, and can constantly cause Git to freeze (especially when a development server is running and locking those files).

Since you already accidentally added `node_modules` to your Git tracking in the past, just adding a `.gitignore` file isn't enough—you have to tell Git to explicitly *forget* about the folder first.

To fix this and push cleanly, follow these exact steps in your terminal:

**1. Create a `.gitignore` file**
Make sure you have a file named exactly `.gitignore` in your root folder (the same place as `package.json`), and ensure it contains this line:
```text
node_modules
```

**2. Make Git forget the folder**
Run this command. It deletes `node_modules` from Git's memory, but leaves the actual folder completely safe on your computer:
```bash
git rm -r --cached node_modules
```

**3. Save the removal**
Add your new `.gitignore` file and commit the "deletion" so Git officially records that it shouldn't track those files anymore:
```bash
git add .
git commit -m "chore: stop tracking node_modules"
```

**4. Push normally**
Now you can safely push all your code to GitHub, and it will be completely free of the `node_modules` folder!
```bash
git push -u origin main
```
