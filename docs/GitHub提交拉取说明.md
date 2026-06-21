# GitHub 提交、拉取和分支同步说明

- 适用项目：Dreamina CLI 即梦批量生产工具
- 仓库地址：https://github.com/hyc0122/dreamina_cli
- 当前开发分支：`codex/v1.00.008-workbench-template`
- 默认原则：日常修改提交到开发分支，不直接提交或推送 `main`。

## 分支说明

`main` 是主分支，适合保存稳定版本、给普通用户拉取和部署使用。

`codex/v1.00.008-workbench-template` 是当前开发分支，后续功能修改、文档更新、问题修复都优先提交到这个分支。

确认发布、合并或同步前，先检查当前所在分支：

```powershell
git branch --show-current
git status
```

如果显示的是 `main`，但你准备提交日常开发修改，请先切回开发分支：

```powershell
git checkout codex/v1.00.008-workbench-template
```

## 第一次从 GitHub 拉取项目

选择一个工作目录，例如：

```powershell
cd D:\projects
```

克隆仓库：

```powershell
git clone https://github.com/hyc0122/dreamina_cli.git
cd dreamina_cli
```

如果要进入当前开发分支：

```powershell
git fetch origin
git checkout codex/v1.00.008-workbench-template
git pull origin codex/v1.00.008-workbench-template
```

也可以直接克隆指定分支：

```powershell
git clone -b codex/v1.00.008-workbench-template https://github.com/hyc0122/dreamina_cli.git
cd dreamina_cli
```

## 拉取 main 最新代码

只想查看或更新 `main` 时使用：

```powershell
git checkout main
git pull origin main
```

拉完后，如果还要继续开发，切回开发分支：

```powershell
git checkout codex/v1.00.008-workbench-template
```

## 拉取当前开发分支最新代码

日常继续开发前，推荐先执行：

```powershell
git checkout codex/v1.00.008-workbench-template
git pull origin codex/v1.00.008-workbench-template
```

如果本地分支已经设置了 upstream，也可以简写：

```powershell
git pull
```

## 提交并推送当前开发分支

先确认分支和改动：

```powershell
git branch --show-current
git status --short
```

确认在 `codex/v1.00.008-workbench-template` 后，再添加需要提交的文件。建议明确写文件路径：

```powershell
git add README.md CHANGELOG.md docs/GitHub提交拉取说明.md docs/releases/v1.00.026-github-branch-workflow.md
```

如果本次还修改了前后端源码，再把对应源码文件加入 `git add`。

创建提交：

```powershell
git commit -m "docs: add github branch workflow guide"
```

推送开发分支：

```powershell
git push origin codex/v1.00.008-workbench-template
```

如果是新分支第一次推送：

```powershell
git push -u origin codex/v1.00.008-workbench-template
```

## 把 main 的更新同步到开发分支

这是常用操作：先更新本地 `main`，再把 `main` 合并进开发分支。

```powershell
git fetch origin
git checkout main
git pull origin main
git checkout codex/v1.00.008-workbench-template
git merge main
git push origin codex/v1.00.008-workbench-template
```

如果出现冲突，按文件提示解决冲突后执行：

```powershell
git status
git add 冲突文件路径
git commit
git push origin codex/v1.00.008-workbench-template
```

## 把开发分支同步到 main

默认不执行这个操作。只有确认要发布稳定版本，或者明确需要让 `main` 跟上开发分支时，才同步到 `main`。

推荐方式是在 GitHub 上从开发分支创建 Pull Request，目标分支选择 `main`，检查无误后再合并。

如果必须在本地命令行合并：

```powershell
git checkout main
git pull origin main
git merge --no-ff codex/v1.00.008-workbench-template
git push origin main
git checkout codex/v1.00.008-workbench-template
```

注意：这一步会更新远端 `main`，执行前必须确认当前开发分支已经验证通过。

## 从 main 新建开发分支

以后新开功能分支时使用：

```powershell
git checkout main
git pull origin main
git checkout -b codex/新功能名称
git push -u origin codex/新功能名称
```

示例：

```powershell
git checkout -b codex/asset-image-history
git push -u origin codex/asset-image-history
```

## 常见情况

查看远端分支：

```powershell
git branch -r
```

查看本地和远端提交差异：

```powershell
git log --oneline --decorate --graph --all -n 20
```

本地有未提交修改，暂时不能拉取时，可以先保存现场：

```powershell
git stash push -m "临时保存当前修改"
git pull origin codex/v1.00.008-workbench-template
git stash pop
```

提交前发现自己在 `main`，不要直接推送，先切回开发分支或新建分支：

```powershell
git checkout codex/v1.00.008-workbench-template
```
