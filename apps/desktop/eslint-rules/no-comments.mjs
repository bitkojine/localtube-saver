export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow all comments',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      noComments: 'Comments are not allowed in the codebase. Move all documentation to .md files.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      Program() {
        const comments = sourceCode.getAllComments();
        comments.forEach((comment) => {
          context.report({
            loc: comment.loc,
            messageId: 'noComments',
          });
        });
      },
    };
  },
};
