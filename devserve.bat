rd /s /q _site REM Delete _site folder
call bundle install
call bundle exec ruby script/generate/views.rb
call bundle exec jekyll serve --config=_config.yml,_config_dev.yml
pause