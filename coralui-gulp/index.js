module.exports = function(gulp) {
  'use strict';
  
  const runSequence = require('run-sequence').use(gulp);
  
  // Tasks
  require('./tasks/clean.js')(gulp);
  require('./tasks/lint.js')(gulp);
  require('./tasks/i18n.js')(gulp);
  require('./tasks/docs.js')(gulp);
  require('./tasks/templates.js')(gulp);
  require('./tasks/styles.js')(gulp);
  require('./tasks/scripts.js')(gulp);
  require('./tasks/tests.js')(gulp);
  require('./tasks/watch.js')(gulp);
  
  gulp.task('build', function() {
    runSequence('clean', 'lint', 'docs', 'styles', 'templates', 'scripts');
  });
  
  gulp.task('dev', function() {
    runSequence('clean', 'lint', 'docs', 'styles', 'templates', 'scripts', 'tests-watch', 'watch');
  });
  
  gulp.task('default', function() {
    runSequence('clean', 'lint', 'docs', 'styles', 'templates', 'scripts', 'tests');
  });
};