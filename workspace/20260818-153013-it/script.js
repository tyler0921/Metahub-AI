document.addEventListener('DOMContentLoaded', function () {
    // #contact 섹션으로 스크롤 이동 (사용자 클릭 시)
    const ctaButtons = document.querySelectorAll('.cta-button');
    ctaButtons.forEach(button => {
        button.addEventListener('click', function (e) {
            e.preventDefault();
            const contactSection = document.getElementById('contact');
            if (contactSection) {
                contactSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // 메인 섹션 스크롤 이동 (메뉴 또는 기타 링크가 추가될 경우 사용)
    // 예시: const navLinks = document.querySelectorAll('nav a'); ... (필요 시 추가)
});