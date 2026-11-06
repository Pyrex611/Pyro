@echo off
REM Copy to scripts\env.cmd, fill in, and run it in every new CMD window (CMD forgets variables).
REM scripts\env.cmd is gitignored. Do NOT put secret values here, only names/IDs.
set PROJECT_ID=pyro-lp-CHANGE-ME
set PROJECT_NUM=CHANGE-ME-AFTER-STEP-5
set REGION=us-central1
set JOB_NAME=gmaps-legacy
set SA_NAME=lp-job-sa
set SUPABASE_URL=https://CHANGE-ME.supabase.co
set SA_EMAIL=%SA_NAME%@%PROJECT_ID%.iam.gserviceaccount.com
set BUILD_SA=%PROJECT_NUM%-compute@developer.gserviceaccount.com
echo Loaded: project=%PROJECT_ID% region=%REGION% job=%JOB_NAME%
